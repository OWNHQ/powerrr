# Ethereum provider collateral coverage audit

This audit compares the checked-in wallet discovery registry with the live
Ethereum collateral sets used by the current USDC borrowing paths.

## Reproducible snapshot

| Field           | Value                                                                |
| --------------- | -------------------------------------------------------------------- |
| Ethereum block  | `25,689,398`                                                         |
| Block hash      | `0xf4d1b19401e4533a642570622003ff8d1a097b26f68b633b8b8fff78993f050a` |
| Block timestamp | `2026-08-05T14:43:23.000Z`                                           |
| RPC             | `ethereum-rpc.publicnode.com`                                        |

The Aave, Spark and Compound inventories, configurations, oracle prices and
caps were read directly onchain at that block. Morpho's official listed-market
index was used only to enumerate candidate market IDs because Morpho Blue is
permissionless and its core contract does not expose an enumerable market
list. Every Morpho candidate's parameters, market totals and oracle price were
then independently read from Ethereum at the audit block.

## Result

| Provider path                       | New-position collateral set | Missing before audit | Result             |
| ----------------------------------- | --------------------------: | -------------------- | ------------------ |
| Aave V3 Ethereum Core standard mode |                          16 | eBTC, BTC.b          | Both added         |
| SparkLend Ethereum standard mode    |                           6 | None                 | Complete           |
| Compound III Ethereum USDC Comet    |                           9 | None                 | Complete           |
| Official-listed Morpho USDC paths   |                 119 markets | 76 contracts         | Added and verified |

Aave also listed two expired February 2026 Pendle PT reserves with nonzero but
negligible LTVs. Both were already above their one-token supply caps, leaving
zero capacity for a new position. They were not added. Isolation-mode reserves,
frozen reserves, paused reserves, zero-LTV assets and zero-capacity reserves are
not current estimator paths.

The coverage was refreshed at Ethereum block `25,694,451` on 2026-08-06. The
official index returned 120 listed native-USDC markets. Onchain identity checks
produced 119 executable nonzero-collateral markets and 108 unique collateral
contracts. The checked-in manifest records all 120 official market IDs and each creation
block, token identities, oracle, IRM and LLTV. Runtime still independently
verifies and reads every wallet-relevant market at the user's pinned block.
Morpho remains permissionless; “official listed” is an enumeration boundary,
not a safety endorsement.

## Added contracts

| Symbol | Ethereum contract                            | Aave LTV | Remaining supply capacity at audit block |
| ------ | -------------------------------------------- | -------: | ---------------------------------------: |
| eBTC   | `0x657e8C867D8B37dCC18fA4Caead9C45EB088C642` |      67% |                         51.20232139 eBTC |
| BTC.b  | `0xB0F70C0bD6FD87dbEb7C10dC692a2a6106817072` |      73% |                        54.56074729 BTC.b |

Both entries use Aave's block-pinned mainnet oracle route for wallet valuation.
They are distinct Bitcoin wrapper assets and are not treated as interchangeable
with WBTC, cbBTC or tBTC.

The production appraisal pipeline returned high-confidence Aave oracle prices for both assets:
`$64,720.24288666` for eBTC and `$64,478.0530031` for BTC.b. The full 254-token
registry result was 150 priced and 104 unavailable at that block; adding these
provider assets did not introduce an unpriceable wallet entry.

## Reproduction

```text
PUBLIC_ETHEREUM_RPC_URL=<ethereum-rpc> pnpm exec tsx tooling/audit-provider-assets.ts <report.json>
```

The audit script and Morpho GraphQL enumeration are development-only. They are
not imported into the browser and do not alter the wallet-provider-only runtime.
