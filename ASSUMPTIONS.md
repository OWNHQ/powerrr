# Runtime assumptions

- Powerrr supports Ethereum Mainnet only.
- Wallet discovery, prices, protocol state, liquidity, ENS, and .gwei names are read through the user-selected EIP-1193 wallet provider at a pinned recent block.
- Aave v3 and SparkLend capacity use their onchain protocol data providers, native oracles, reserve configuration, caps, liquidity, and current variable rate.
- Compound III uses the Ethereum USDC Comet contract, configured price feeds, collateral factors, liquidity, debt state, and current borrow-rate function.
- Morpho uses checked-in Ethereum USDC market IDs and reads each market, oracle, and IRM directly onchain. Markets outside the manifest are unavailable.
- Wallet discovery scans the checked-in top-250 registry plus required protocol collateral. Pricing uses reviewed protocol oracles, fresh Chainlink feeds, liquid Uniswap V3 TWAPs, and a clearly marked low-confidence spot fallback.
- ENS or .gwei names that cannot be resolved completely onchain fail closed to the abbreviated wallet address.
- The estimator applies a balanced operating buffer and available-liquidity cap. Its result is not a guarantee of transaction success or protection from liquidation.
- Risk labels describe distance from current protocol thresholds. Powerrr does not estimate liquidation probability or provide personalized financial advice.
- The OWN row appears only above $5,000, publishes no capacity, pricing, or repayment projection, and links to OWN's public contact form without transmitting wallet data.
