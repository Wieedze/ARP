// What an agent without ARP can do: print a result's SKILL.md. Both arms get it, so the arms differ only
// in the pulse. No write, no execution, and the only hosts are GitHub's.
const [repo, name] = process.argv.slice(2);
if (!/^[\w.-]+\/[\w.-]+$/.test(repo ?? "") || !name) {
    console.error("usage: node read-skill.mjs owner/repo skill-name");
    process.exit(1);
}
const headers = {"user-agent": "arp-pulse-eval", ...(process.env.GITHUB_TOKEN ? {authorization: `Bearer ${process.env.GITHUB_TOKEN}`} : {})};
const tree = await (await fetch(`https://api.github.com/repos/${repo}/git/trees/HEAD?recursive=1`, {headers})).json();
const paths = (tree.tree ?? []).map((entry) => entry.path).filter((path) => /(^|\/)skill\.md$/i.test(path));
const wanted = name.toLowerCase().replace(/[\s_]+/g, "-");
const named = paths.filter((path) => path.split("/").at(-2)?.toLowerCase() === wanted);
const path = named[0] ?? (paths.length === 1 ? paths[0] : undefined);
if (path === undefined) {
    console.log(`no directory named ${name}. SKILL.md files in the repository:\n${paths.slice(0, 40).join("\n")}`);
    process.exit(0);
}
const text = await (await fetch(`https://raw.githubusercontent.com/${repo}/HEAD/${path}`)).text();
console.log(text.slice(0, 12000));
