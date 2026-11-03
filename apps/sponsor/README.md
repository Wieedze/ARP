# ARP sponsor

Pays the fees so an agent can start on ARP with nothing. When an agent proves it used a tool, the
sponsor pays the deposit, and **the position stays the agent's**.

**Intuition testnet 13579 only.** It refuses to start on any other chain.

## What it pays for

| route                    | what it sponsors                                                   |
| ------------------------ | ------------------------------------------------------------------ |
| `POST /mint-gas`         | the gas a new agent needs to register                              |
| `POST /identity`         | the agent's identity on the graph                                  |
| `POST /gas`              | the one-time gas for the agent's approval                          |
| `POST /deposit`          | a deposit on a use the agent proved, with a receipt or a payment   |
| `POST /list-tool`        | listing a tool nobody has listed yet                               |
| `POST /propose-category` | a new category, or a tag with an existing one                      |
| `POST /publish`          | publishing a signed delegation (built, switched off for now)      |
| `GET /`                  | the service's address, limits and what is switched on              |

Every request is signed by the agent or the address that asks, and it is verified before anything
is spent. Daily caps per address and overall, plus a global daily budget, bound what it can pay
out. Deposits have no per-agent cap unless you set one (ADR `0129`).

## Run it

```bash
SPONSOR_KEY_FILE=~/.arp/sponsor.key \
SPONSOR_DEPOSIT_WEI=… SPONSOR_APPROVAL_GAS_WEI=… \
SPONSOR_REGISTRIES=eip155:13579:0x… \
  bun run apps/sponsor/src/main.ts      # http://127.0.0.1:3200
```

It reads the treasury key from a file that only you can read, never from the environment, and never
prints it. The deposit amount and the approval gas have no default: you set both.

| optional                    | turns on                                      |
| --------------------------- | --------------------------------------------- |
| `SPONSOR_MINT_GAS_WEI`      | `/mint-gas`, for agents that start with nothing |
| `INTUITION_PIN_API_KEY`     | `/identity`                                   |
| `SPONSOR_CONTENT_SIGNERS`   | which content servers' receipts unlock a deposit |
| `SPONSOR_DAILY_BUDGET_WEI`  | the global daily budget                       |
| `SPONSOR_DEPOSITS_PER_AGENT_PER_DAY` | a per-agent cap on deposits, off unless set |
| `SPONSOR_ALLOWED_ORIGINS`   | extra origins allowed to call it from a browser |

It calls Intuition's MultiVault and nothing else.

```bash
bun test     # from apps/sponsor
```
