/**
 * Agent-Auditor — pure executor function. No HTTP, no signing, no chain
 * interaction. Just: take a Solidity contract, run an audit via the
 * `claude -p` subprocess (using the operator's Pro Max subscription),
 * return structured findings.
 *
 * The actual methodology is the Trail of Bits skill set installed at
 * `~/.claude/skills/`. We don't inline their content in the prompt; we
 * ask the subprocess to invoke them. Claude orchestrates which skills
 * to apply based on the input.
 *
 * Used as a standalone CLI for testing:
 *
 *     bun scripts/agent-auditor.ts sample-contracts/Reentrant.sol
 *
 * Wrapped by `scripts/agent-server.ts` for the on-chain hire flow.
 */

import {$} from "bun";
import {readFile} from "node:fs/promises";
import {basename, resolve} from "node:path";

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export type Finding = {
    severity: Severity;
    title: string;
    description: string;
    location?: string;
};

export type AuditReport = {
    contractPath: string;
    contractName: string;
    summary: string;
    findings: Finding[];
    methodologiesUsed: string[];
    rawResponse: string;
};

/**
 * Skills we ask the agent to draw from. These are the on-chain ARP
 * modules the agent will stake on after a successful audit.
 */
const RECOMMENDED_SKILLS = [
    "secure-workflow-guide",
    "guidelines-advisor",
    "code-maturity-assessor",
];

const AUDIT_PROMPT = `You are a Solidity security auditor.

Read the contract below and produce a concise audit report following the Trail of Bits
methodology. If the secure-workflow-guide, guidelines-advisor, or code-maturity-assessor
skills are available, use them — they encode the canonical workflow.

Output strictly in this Markdown format (no preamble, no closing remarks):

## Summary
<one paragraph, 2-4 sentences>

## Findings
For each finding, emit a block:
### [SEVERITY] Title
**Location**: <function or line if known, else "N/A">
**Description**: <1-3 sentences>

Severities (uppercase): CRITICAL, HIGH, MEDIUM, LOW, INFO

If there are no findings of a severity, omit it. If the contract is clean,
emit a single "### [INFO] No critical findings" block.

## Methodologies applied
- <name of skill / methodology used>

Contract:

\`\`\`solidity
{{CONTRACT_CODE}}
\`\`\`
`;

/**
 * Run an audit against `contractPath`. Returns a structured report.
 */
export async function auditContract(contractPath: string): Promise<AuditReport> {
    const absPath = resolve(contractPath);
    const code = await readFile(absPath, "utf8");
    const contractName = basename(absPath, ".sol");

    const prompt = AUDIT_PROMPT.replace("{{CONTRACT_CODE}}", code);

    // The `claude` CLI inherits the operator's Pro Max auth. The subprocess
    // call streams output via stdout; .text() collects it after exit.
    const raw = await $`claude -p ${prompt}`.text();

    const findings = parseFindings(raw);
    const methodologiesUsed = parseMethodologies(raw);
    const summary = parseSummary(raw);

    return {
        contractPath: absPath,
        contractName,
        summary,
        findings,
        methodologiesUsed,
        rawResponse: raw,
    };
}

function parseSummary(md: string): string {
    const m = md.match(/##\s*Summary\s*\n([\s\S]*?)(?=\n##\s|$)/);
    return m ? m[1].trim() : "";
}

function parseFindings(md: string): Finding[] {
    const block = md.match(/##\s*Findings\s*\n([\s\S]*?)(?=\n##\s|$)/);
    if (!block) return [];
    const body = block[1];

    const findings: Finding[] = [];
    const finding = /###\s*\[(CRITICAL|HIGH|MEDIUM|LOW|INFO)\]\s*([^\n]+)\n([\s\S]*?)(?=\n###\s|$)/gi;
    let match: RegExpExecArray | null;
    while ((match = finding.exec(body)) !== null) {
        const severity = match[1].toLowerCase() as Severity;
        const title = match[2].trim();
        const sub = match[3];
        const loc = sub.match(/\*\*Location\*\*:\s*([^\n]+)/i);
        const desc = sub.match(/\*\*Description\*\*:\s*([\s\S]+?)(?=\n\*\*|\n###|$)/i);
        findings.push({
            severity,
            title,
            location: loc ? loc[1].trim() : undefined,
            description: desc ? desc[1].trim() : sub.trim(),
        });
    }
    return findings;
}

function parseMethodologies(md: string): string[] {
    const block = md.match(/##\s*Methodologies applied\s*\n([\s\S]*?)$/i);
    if (!block) return RECOMMENDED_SKILLS;
    const items = [...block[1].matchAll(/^[\s-]*([^\n]+)/gm)]
        .map((m) => m[1].trim())
        .filter((s) => s.length > 0);
    return items.length > 0 ? items : RECOMMENDED_SKILLS;
}

// CLI entry point — `bun scripts/agent-auditor.ts <path>`
if (import.meta.main) {
    const path = process.argv[2];
    if (!path) {
        console.error("Usage: bun scripts/agent-auditor.ts <path-to-sol>");
        process.exit(1);
    }
    auditContract(path)
        .then((report) => {
            console.log("Contract:", report.contractName);
            console.log("Findings:", report.findings.length);
            console.log("");
            console.log("---");
            console.log(report.rawResponse);
        })
        .catch((err) => {
            console.error("Audit failed:", err);
            process.exit(1);
        });
}
