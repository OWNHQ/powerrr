# Ethereum token price-coverage audit — 2026-08-05

## Decision

The production appraisal hierarchy now prices 145 of the 252 reviewed Ethereum
contracts at the audited block, up from 111 before this work. No token was
removed: the earlier contract-state and liquidity review found no asset that
met a defensible dead-token threshold.

The remaining 107 contracts stay visible when held but are marked unavailable.
They are not assigned a peg, current-block spot price, price from another
chain, stale value, or external-API fallback.

## Reproducible block

| Field              | Value                                                                |
| ------------------ | -------------------------------------------------------------------- |
| Ethereum block     | `25,689,063` (`0x187fbe7`)                                           |
| Block hash         | `0x34a4d41ea3b0dadeb458dfdb72ae0ee6f28a7c8935bbc3d1c78f9ecf24c3f71b` |
| Timestamp          | `2026-08-05T13:35:47.000Z`                                           |
| Primary RPC        | `eth.drpc.org`                                                       |
| Independent replay | `ethereum-rpc.publicnode.com`                                        |

Both public RPCs returned the same block hash, availability, price, source,
and route for all 252 contracts.

## Production appraisal result

| Result        | Contracts |  Share |
| ------------- | --------: | -----: |
| Appraised     |       145 | 57.54% |
| Not appraised |       107 | 42.46% |
| Total         |       252 |   100% |

The 145 appraisals were produced by:

| Route class                                   | Contracts |
| --------------------------------------------- | --------: |
| Aave and Spark protocol oracles               |        42 |
| Chainlink direct feeds and NAV/exchange feeds |        11 |
| Chainlink Feed Registry USD and ETH feeds     |        24 |
| Exact reviewed wrapper/share rates            |        16 |
| Uniswap V3 30-minute TWAP                     |        52 |

## Changes from the original 111-token result

- All otherwise-unpriced contracts are checked against the live Aave and Spark
  oracle configurations at the chosen block.
- Direct Chainlink proxies are pinned by exact token contract. Routes include
  USD, USDC, ETH, and BTC quote denominations; non-USD quotes are converted
  using an independently appraised quote asset from the same block.
- Reviewed ERC-4626 contracts are valued with `asset()` and
  `convertToAssets(one share)`. Both wrapper and underlying decimals and the
  returned underlying address are verified at runtime.
- WBETH, stkAAVE, CDCETH, and cDAI use their reviewed contract exchange-rate
  methods. eETH uses the exact eETH-to-weETH conversion. These are valuation
  routes only: the wallet tokens remain distinct and are not silently merged
  for protocol capacity.
- Chainlink token/ETH Feed Registry routes are attempted before Uniswap.
- Uniswap remains a 30-minute TWAP with the existing minimum-liquidity check;
  no V2 or current-block spot-price fallback was added.

## Remaining failures

The remaining contracts have no fresh result from the configured protocol
oracles, official Chainlink inventory, reviewed deterministic wrapper method,
or sufficiently liquid direct Uniswap V3 TWAP at the tested block. Many are
active assets whose primary liquidity is on another chain or venue. That is a
reason to leave them unavailable on Ethereum, not evidence that their Ethereum
contract should be hidden.

The earlier status audit found bytecode and nonzero supply for all original 141
failures, recent transfers for 137, and no automatic dead candidates. Router
failure, a thin Ethereum pool, or stronger liquidity on another chain remains
insufficient evidence for deletion.

## Reproduction

```sh
PUBLIC_ETHEREUM_RPC_URL=<public-rpc> AUDIT_BLOCK_TAG=0x187fbe7 pnpm exec tsx tooling/audit-ethereum-token-prices.ts <report.json>
```

Run the same command through an independent Ethereum RPC and compare each
result's address, availability, price, source, and route.
