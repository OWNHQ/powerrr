# Runtime assumptions

- Powerrr supports Ethereum Mainnet only.
- Wallet discovery, prices, conversions, protocol state, liquidity, ENS, and .gwei names are read through the user-selected EIP-1193 wallet provider at one pinned recent block before results are published. Later selection and comparison interactions use only that immutable in-memory snapshot.
- Aave v3 and SparkLend capacity use their onchain protocol data providers, native oracles, reserve configuration, caps, liquidity, and current variable rate.
- Compound III uses the Ethereum USDC Comet contract, configured price feeds, collateral factors, liquidity, debt state, and current borrow-rate function.
- Morpho uses checked-in Ethereum USDC market IDs and reads each market, oracle, and IRM directly onchain. Markets outside the manifest are unavailable.
- Wallet discovery scans 250 ranked Ethereum contracts plus 78 reviewed provider-path additions (328 total). Ranking metadata does not guarantee a live price route; pricing availability is established separately at the pinned block.
- Only ETH/WETH (exact 1:1 wrapping) and stETH/wstETH (live `getWstETHByStETH`) are combined for protocol projection. stETH and wstETH remain distinct wallet assets and are never treated as equal raw quantities or prices.
- ENS or .gwei names that cannot be resolved completely onchain fail closed to the abbreviated wallet address.
- The primary capacity is the exact modeled protocol maximum capped by available liquidity and live protocol constraints. Risk scenarios remain comparisons, not guarantees of transaction success or protection from liquidation.
- Risk labels describe distance from current protocol thresholds. Powerrr does not estimate liquidation probability or provide personalized financial advice.
- OWN is not included as a borrowing provider. A minimal footer credits OWN and links to `https://own.casa` without transmitting wallet data through the referrer.
