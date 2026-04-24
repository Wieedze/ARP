# Task 01 — Project Setup

## Objective

Initialize the repository with a working Foundry project for contracts and a Vite + React + TypeScript project for the UI, with shared tooling configured.

## Prerequisites

- Node.js 20+
- Foundry (latest)
- pnpm (preferred over npm for workspace support)

## Deliverables

- [ ] `contracts/` folder initialized with `forge init --no-git`
- [ ] `app/` folder initialized with Vite React-TS template
- [ ] Root `package.json` with pnpm workspaces configured
- [ ] `schemas/` folder with empty stubs for the three seed module schemas
- [ ] `deployments/` folder, empty but gitkept
- [ ] `.gitignore` at root, covering node_modules, out, cache, broadcast, .env, .env.local
- [ ] `.env.example` at root documenting required env vars (RPC_URL, PRIVATE_KEY placeholders, never real values)
- [ ] `README.md` updated with local dev instructions
- [ ] Conventional commits configured (commitlint + husky optional but recommended)
- [ ] Formatter configured: Prettier for TS, forge fmt for Solidity
- [ ] Linter configured: ESLint for TS, solhint for Solidity
- [ ] Initial commit made with conventional commit message

## Steps

### 1. Initialize the monorepo

```bash
pnpm init
# Edit package.json to add workspaces: ["contracts", "app"]
# Edit package.json scripts for common tasks
```

### 2. Initialize contracts workspace

```bash
mkdir contracts
cd contracts
forge init --no-commit --no-git
# Remove the default Counter contract and tests
rm src/Counter.sol test/Counter.t.sol script/Counter.s.sol
cd ..
```

Configure `contracts/foundry.toml` with:
- Solidity version 0.8.24 or newer
- Optimizer enabled, runs = 200
- FFI disabled (security default)
- RPC endpoints for base_sepolia

### 3. Initialize app workspace

```bash
pnpm create vite app --template react-ts
cd app
pnpm install
pnpm add viem wagmi @tanstack/react-query
pnpm add -D tailwindcss postcss autoprefixer
pnpm exec tailwindcss init -p
cd ..
```

Refer to the ethereum-smart-contracts skill for Foundry config best practices and the frontend-design skill for Vite + Tailwind setup conventions.

### 4. Set up shared schemas folder

```bash
mkdir -p schemas
touch schemas/solidity-audit.v1.json
touch schemas/url-classification.v1.json
touch schemas/claim-verification.v1.json
```

Leave the files empty for now — they'll be filled in Task 03.

### 5. Tooling

Install and configure:
- Prettier at root with a shared config
- ESLint in the app workspace, using the TypeScript strict preset
- solhint in the contracts workspace with the recommended ruleset
- Forge fmt is built into Foundry, just set a consistent style

### 6. Git hygiene

- Initialize git at repo root (not inside subfolders)
- Make one clean initial commit: `chore: initial project scaffolding`
- Verify no secrets, no build artifacts, no node_modules are committed

## Acceptance criteria

- `pnpm install` at root installs everything, both workspaces included
- `pnpm --filter contracts forge test` runs (even if no tests yet) without errors
- `pnpm --filter app dev` launches a dev server that shows at least the default Vite page
- `pnpm lint` at root runs both ESLint and solhint
- `pnpm format` at root runs Prettier and forge fmt
- `git log --oneline` shows one clean commit with a conventional message

## Do not do in this task

- Do not write any contracts yet
- Do not style the UI yet (that's Task 04)
- Do not add testing frameworks beyond what comes with Foundry and Vite
- Do not add Storybook, Ladle, or any component workshop — it's out of scope
- Do not add a CI pipeline — out of scope for MVP

## Report format when complete

```
## Task 01 complete

**Shipped**
- Monorepo at commit SHA: <sha>
- contracts/ uses Foundry, Solidity <version>
- app/ uses Vite + React + TS + Tailwind + Wagmi/Viem
- schemas/, deployments/ folders initialized
- Lint + format pipelines working

**Decisions made**
- Used pnpm workspaces (rather than npm/yarn) for <reason>
- Chose Solidity <version> because <reason>
- [Any other non-obvious choices]

**Next**
- Ready for Task 02 (ModuleRegistry contract)
- Blocked on: <nothing, or list>
```
