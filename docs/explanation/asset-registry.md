# Curated Ethereum asset registry

The static application uses the checked-in registry
`ethereum-top250-2026-07-29-v1`. It contains a dated CoinGecko market-cap
snapshot joined to a chain-1 token metadata list: 250 ranked Ethereum ERC-20
contracts plus two reviewed registry additions, LINK and MKR, for 252 runtime
contracts. Balances are read through the connected wallet's
EIP-1193 provider using chunked Multicall3 calls.

The static registry is bundled into the application. It is never fetched from
a token-list server at runtime, and symbols, decimals, icons, or prices are not
trusted from arbitrary wallet tokens.

Ranking membership does not guarantee that a token has a live Chainlink feed
or a sufficiently liquid Uniswap pool at the selected block. Every contract is
on Ethereum mainnet; projects with origins elsewhere do not cause another chain
to be queried. The original generator input JSON files were not retained, so
the exact reason LINK and MKR missed the original ranking join cannot be
reconstructed. Future registry generations must emit input hashes and rejected
token reasons.

The [2026-08-05 latest-block coverage audit](../audits/ethereum-token-price-coverage-2026-08-05.md)
replayed the production hierarchy for all 252 contracts and investigated every
failure against contract state, recent transfers, and broader direct V2
liquidity. It found no high-confidence dead Ethereum contract, so the audit did
not remove any registry entry.

Live wallet discovery is deliberately finite and never enumerates arbitrary
wallet tokens. The browser uses reviewed Aave and Spark oracles, fresh
Chainlink direct and Feed Registry routes, exact reviewed wrapper/share rates,
and finally a liquid Uniswap V3 30-minute TWAP. ETH-, BTC-, and stablecoin-
quoted feeds use an independently appraised quote asset from the same block.
No current-block DEX spot price is accepted. Failed routes remain visible with
an asset-specific reason.

| Category       | Symbol | Canonical Ethereum address                   |
| -------------- | ------ | -------------------------------------------- |
| Native/wrapped | ETH    | `0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE` |
| Native/wrapped | WETH   | `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2` |
| Liquid staking | stETH  | `0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84` |
| Liquid staking | wstETH | `0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0` |
| Liquid staking | rETH   | `0xae78736Cd615f374D3085123A210448E74Fc6393` |
| Liquid staking | cbETH  | `0xBe9895146f7AF43049ca1c1AE358B0541Ea49704` |
| Bitcoin        | WBTC   | `0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599` |
| Bitcoin        | cbBTC  | `0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf` |
| Bitcoin        | tBTC   | `0x18084fbA666a33d37592fA2633fD49a74DD93a88` |
| Stablecoin     | USDC   | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` |
| Stablecoin     | USDT   | `0xdAC17F958D2ee523a2206206994597C13D831ec7` |
| Stablecoin     | DAI    | `0x6B175474E89094C44Da98b954EedeAC495271d0F` |
| Stablecoin     | sDAI   | `0x83F20F44975D03b1b09e64809B757c47f942BEeA` |
| Stablecoin     | USDS   | `0xdC035D45d973E3EC169d2276DDab16f1e407384F` |
| Stablecoin     | sUSDS  | `0xA3931d71877C0E7a3148CB7EB4463524feC27Fbd` |
| Stablecoin     | GHO    | `0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f` |
| Stablecoin     | PYUSD  | `0x6c3ea9036406852006290770BEdFcAbA0e23A0e8` |
| Governance     | LINK   | `0x514910771AF9Ca656af840dff83E8264EcF986CA` |
| Governance     | AAVE   | `0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9` |
| Governance     | UNI    | `0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984` |
| Governance     | MKR    | `0x9f8F72aA9304c8B593d555F12ef6589cC3A579A2` |
| Governance     | LDO    | `0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32` |
| Governance     | ENS    | `0xC18360217D8F7Ab5e7c516566761ea12Ce7F9D72` |

Each code entry also pins decimals, category, candidate providers, an icon key,
and an approved Aave-compatible on-chain oracle/asset pair. Candidate provider
metadata is only a discovery hint: live adapters still verify active/frozen
state, collateral enablement, nonzero LTV and oracle price, caps, and liquidity
before including collateral.

Native ETH is modeled as WETH-equivalent at 1:1. stETH and wstETH remain
different assets and raw quantities; only protocol projection combines them,
using live block-pinned `getWstETHByStETH` output. Both retain their original wallet balance plus
explicit protocol token, converted raw balance, rate, and `requiredAction:
"wrap"` metadata. They are shown as wrapping-required.

Balances are read in deterministic JSON-RPC chunks at the resolved block.
Oracle, conversion, and DEX reads happen only for positive balances and their
explicit pricing dependencies. Unsupported and unpriced positive balances
remain visible; there is no token indexer or portfolio API fallback.

No other family is merged: WBTC/cbBTC/tBTC, stablecoins, savings wrappers, and
arbitrary market-swappable assets remain independent.
