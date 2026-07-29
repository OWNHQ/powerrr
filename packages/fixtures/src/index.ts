import type {
  HexAddress,
  PortfolioAsset,
  ProtocolMetadata,
  QuoteProvenance,
  ScenarioDefinition,
} from "@powerrr/shared-types";

export const CURRENT_FIXTURE_BLOCK = "23123456";

export const demoAddresses = {
  powerrr: "0x1111111111111111111111111111111111111111",
  bluechip: "0x2222222222222222222222222222222222222222",
  stablecoin: "0x3333333333333333333333333333333333333333",
  existing: "0x4444444444444444444444444444444444444444",
  empty: "0x0000000000000000000000000000000000000000",
} as const satisfies Record<string, HexAddress>;

export const ensFixtures = {
  "powerrr.eth": demoAddresses.powerrr,
  "bluechip.eth": demoAddresses.bluechip,
  "stablecoin.eth": demoAddresses.stablecoin,
  "existing.powerrr.eth": demoAddresses.existing,
  "empty.powerrr.eth": demoAddresses.empty,
} as const satisfies Record<string, HexAddress>;

export const tokenFixtures = {
  WETH: {
    token: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    symbol: "WETH",
    name: "Wrapped Ether",
    decimals: 18,
    marketPriceUsd: 3_480,
  },
  wstETH: {
    token: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
    symbol: "wstETH",
    name: "Wrapped liquid staked Ether 2.0",
    decimals: 18,
    marketPriceUsd: 4_020,
  },
  WBTC: {
    token: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
    symbol: "WBTC",
    name: "Wrapped Bitcoin",
    decimals: 8,
    marketPriceUsd: 66_500,
  },
  cbBTC: {
    token: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
    symbol: "cbBTC",
    name: "Coinbase Wrapped BTC",
    decimals: 8,
    marketPriceUsd: 66_100,
  },
  USDC: {
    token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    marketPriceUsd: 1,
  },
  DAI: {
    token: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    symbol: "DAI",
    name: "Dai Stablecoin",
    decimals: 18,
    marketPriceUsd: 1,
  },
  USDS: {
    token: "0xdC035D45d973E3EC169d2276DDab16f1e407384F",
    symbol: "USDS",
    name: "USDS Stablecoin",
    decimals: 18,
    marketPriceUsd: 1,
  },
} as const;

export type TokenSymbol = keyof typeof tokenFixtures;

export function buildPortfolioAsset(
  symbol: TokenSymbol,
  balance: number,
): PortfolioAsset {
  const token = tokenFixtures[symbol];

  return {
    chainId: 1,
    token: token.token,
    symbol: token.symbol,
    name: token.name,
    decimals: token.decimals,
    balance: String(balance),
    balanceRaw: toRawBalance(balance, token.decimals),
    marketPriceUsd: token.marketPriceUsd,
    protocolEligible: protocolEligibilityBySymbol[symbol],
  };
}

function toRawBalance(balance: number, decimals: number): string {
  const precision = Math.min(decimals, 8);
  const [integer = "0", fraction = ""] = balance.toFixed(precision).split(".");
  const paddedFraction = `${fraction}${"0".repeat(decimals)}`.slice(
    0,
    decimals,
  );
  const raw = `${integer}${paddedFraction}`.replace(/^0+(?=\d)/, "");

  return raw || "0";
}

export const protocolEligibilityBySymbol: Record<
  TokenSymbol,
  Record<string, boolean>
> = {
  WETH: {
    own: true,
    "aave-v3": true,
    "aave-v4": true,
    "morpho-blue": true,
    "euler-v2": true,
    "compound-iii": true,
    sparklend: true,
  },
  wstETH: {
    own: true,
    "aave-v3": true,
    "aave-v4": true,
    "morpho-blue": true,
    "euler-v2": true,
    "compound-iii": false,
    sparklend: true,
  },
  WBTC: {
    own: true,
    "aave-v3": true,
    "aave-v4": true,
    "morpho-blue": true,
    "euler-v2": true,
    "compound-iii": true,
    sparklend: false,
  },
  cbBTC: {
    own: true,
    "aave-v3": true,
    "aave-v4": true,
    "morpho-blue": true,
    "euler-v2": false,
    "compound-iii": false,
    sparklend: false,
  },
  USDC: {
    own: true,
    "aave-v3": true,
    "aave-v4": true,
    "morpho-blue": false,
    "euler-v2": true,
    "compound-iii": false,
    sparklend: true,
  },
  DAI: {
    own: true,
    "aave-v3": true,
    "aave-v4": false,
    "morpho-blue": false,
    "euler-v2": true,
    "compound-iii": false,
    sparklend: true,
  },
  USDS: {
    own: true,
    "aave-v3": false,
    "aave-v4": true,
    "morpho-blue": false,
    "euler-v2": false,
    "compound-iii": false,
    sparklend: true,
  },
};

export const portfolioFixtures: Record<HexAddress, PortfolioAsset[]> = {
  [demoAddresses.powerrr]: [
    buildPortfolioAsset("WETH", 18.25),
    buildPortfolioAsset("wstETH", 7.5),
    buildPortfolioAsset("WBTC", 0.62),
    buildPortfolioAsset("USDC", 42_000),
    buildPortfolioAsset("DAI", 9_500),
  ],
  [demoAddresses.bluechip]: [
    buildPortfolioAsset("WETH", 52),
    buildPortfolioAsset("wstETH", 21),
    buildPortfolioAsset("WBTC", 2.4),
    buildPortfolioAsset("cbBTC", 1.1),
  ],
  [demoAddresses.stablecoin]: [
    buildPortfolioAsset("USDC", 250_000),
    buildPortfolioAsset("DAI", 90_000),
    buildPortfolioAsset("USDS", 180_000),
  ],
  [demoAddresses.existing]: [
    buildPortfolioAsset("WETH", 25),
    buildPortfolioAsset("wstETH", 12),
    buildPortfolioAsset("WBTC", 1.1),
    buildPortfolioAsset("USDC", 25_000),
  ],
  [demoAddresses.empty]: [],
};

export type RiskParameter = {
  priceUsd: number;
  ltv: number;
  liquidationThreshold: number;
  borrowCollateralFactor?: number;
  liquidateCollateralFactor?: number;
  maxAdvanceRate?: number;
  haircut?: number;
  family?: string;
  marketId?: string;
  vaultId?: string;
};

export type ProtocolFixture = {
  id: string;
  label: string;
  familyId: string;
  familyLabel: string;
  source: string;
  sourceType: QuoteProvenance["sourceType"];
  freshnessSeconds: number;
  availableLiquidityUsd: number;
  indicativeApr: number;
  targetHealthFactor: number;
  confidencePenalties: {
    sourcePenalty: number;
    stalenessPenalty: number;
    fallbackPenalty: number;
    complexityPenalty: number;
    liquidityPenalty: number;
  };
  collateral: Partial<Record<TokenSymbol, RiskParameter>>;
  assumptions: string[];
  warnings: string[];
};

export const protocolFixtures: Record<string, ProtocolFixture> = {
  own: {
    id: "own",
    label: "OWN",
    familyId: "own",
    familyLabel: "OWN",
    source: "OWN underwriting assumptions v0",
    sourceType: "assumption",
    freshnessSeconds: 0,
    availableLiquidityUsd: 2_500_000,
    indicativeApr: 0.065,
    targetHealthFactor: 1.35,
    confidencePenalties: {
      sourcePenalty: 12,
      stalenessPenalty: 0,
      fallbackPenalty: 0,
      complexityPenalty: 8,
      liquidityPenalty: 0,
    },
    collateral: {
      WETH: {
        priceUsd: 3_410,
        ltv: 0.52,
        liquidationThreshold: 0.62,
        maxAdvanceRate: 0.52,
        haircut: 0.96,
        family: "ETH",
      },
      wstETH: {
        priceUsd: 3_910,
        ltv: 0.5,
        liquidationThreshold: 0.6,
        maxAdvanceRate: 0.5,
        haircut: 0.96,
        family: "ETH",
      },
      WBTC: {
        priceUsd: 64_800,
        ltv: 0.48,
        liquidationThreshold: 0.58,
        maxAdvanceRate: 0.48,
        haircut: 0.94,
        family: "BTC",
      },
      cbBTC: {
        priceUsd: 64_200,
        ltv: 0.46,
        liquidationThreshold: 0.56,
        maxAdvanceRate: 0.46,
        haircut: 0.94,
        family: "BTC",
      },
      USDC: {
        priceUsd: 0.995,
        ltv: 0.72,
        liquidationThreshold: 0.78,
        maxAdvanceRate: 0.72,
        haircut: 0.98,
        family: "USD",
      },
      DAI: {
        priceUsd: 0.992,
        ltv: 0.72,
        liquidationThreshold: 0.78,
        maxAdvanceRate: 0.72,
        haircut: 0.98,
        family: "USD",
      },
      USDS: {
        priceUsd: 0.996,
        ltv: 0.72,
        liquidationThreshold: 0.78,
        maxAdvanceRate: 0.72,
        haircut: 0.98,
        family: "USD",
      },
    },
    assumptions: [
      "OWN eligibility, advance rates, haircuts, rates, capital caps, and recovery model are internal assumptions.",
      "No on-chain liquidation is assumed for OWN.",
    ],
    warnings: [
      "OWN fixture pricing is conservative and not a public term sheet.",
    ],
  },
  "aave-v3": {
    id: "aave-v3",
    label: "Aave v3",
    familyId: "aave",
    familyLabel: "Aave",
    source: "Aave v3 official market/user data fixture",
    sourceType: "official-api",
    freshnessSeconds: 12,
    availableLiquidityUsd: 84_000_000,
    indicativeApr: 0.061,
    targetHealthFactor: 1.35,
    confidencePenalties: {
      sourcePenalty: 2,
      stalenessPenalty: 1,
      fallbackPenalty: 0,
      complexityPenalty: 4,
      liquidityPenalty: 0,
    },
    collateral: {
      WETH: { priceUsd: 3_475, ltv: 0.805, liquidationThreshold: 0.83 },
      wstETH: { priceUsd: 3_985, ltv: 0.785, liquidationThreshold: 0.81 },
      WBTC: { priceUsd: 66_250, ltv: 0.73, liquidationThreshold: 0.78 },
      cbBTC: { priceUsd: 65_900, ltv: 0.7, liquidationThreshold: 0.75 },
      USDC: { priceUsd: 0.999, ltv: 0.77, liquidationThreshold: 0.8 },
      DAI: { priceUsd: 0.998, ltv: 0.75, liquidationThreshold: 0.78 },
    },
    assumptions: [
      "Aave v3 fixture applies reserve-level LTV, liquidation threshold, caps, and variable USDC borrow APR.",
    ],
    warnings: [],
  },
  "aave-v4": {
    id: "aave-v4",
    label: "Aave v4",
    familyId: "aave",
    familyLabel: "Aave",
    source: "Aave v4 hub-and-spoke market fixture",
    sourceType: "official-api",
    freshnessSeconds: 18,
    availableLiquidityUsd: 38_000_000,
    indicativeApr: 0.054,
    targetHealthFactor: 1.38,
    confidencePenalties: {
      sourcePenalty: 3,
      stalenessPenalty: 1,
      fallbackPenalty: 0,
      complexityPenalty: 8,
      liquidityPenalty: 0,
    },
    collateral: {
      WETH: { priceUsd: 3_472, ltv: 0.79, liquidationThreshold: 0.825 },
      wstETH: { priceUsd: 3_970, ltv: 0.77, liquidationThreshold: 0.805 },
      WBTC: { priceUsd: 66_100, ltv: 0.71, liquidationThreshold: 0.765 },
      USDC: { priceUsd: 0.999, ltv: 0.76, liquidationThreshold: 0.795 },
      USDS: { priceUsd: 0.998, ltv: 0.76, liquidationThreshold: 0.795 },
    },
    assumptions: [
      "Aave v4 fixture models hub liquidity and spoke-local risk controls as a single quote row.",
    ],
    warnings: [
      "Aave v4 fixture confidence includes a hub/spoke complexity penalty.",
    ],
  },
  "morpho-blue": {
    id: "morpho-blue",
    label: "Morpho Blue",
    familyId: "morpho-blue",
    familyLabel: "Morpho Blue",
    source: "Morpho Blue official GraphQL market fixture",
    sourceType: "official-api",
    freshnessSeconds: 24,
    availableLiquidityUsd: 19_000_000,
    indicativeApr: 0.048,
    targetHealthFactor: 1.25,
    confidencePenalties: {
      sourcePenalty: 3,
      stalenessPenalty: 2,
      fallbackPenalty: 0,
      complexityPenalty: 7,
      liquidityPenalty: 1,
    },
    collateral: {
      WETH: {
        priceUsd: 3_468,
        ltv: 0.86,
        liquidationThreshold: 0.86,
        marketId: "WETH-USDC-86",
      },
      wstETH: {
        priceUsd: 3_955,
        ltv: 0.845,
        liquidationThreshold: 0.845,
        marketId: "wstETH-USDC-84.5",
      },
      WBTC: {
        priceUsd: 66_000,
        ltv: 0.77,
        liquidationThreshold: 0.77,
        marketId: "WBTC-USDC-77",
      },
      cbBTC: {
        priceUsd: 65_700,
        ltv: 0.74,
        liquidationThreshold: 0.74,
        marketId: "cbBTC-USDC-74",
      },
    },
    assumptions: [
      "Morpho fixture chooses the best isolated USDC market for the wallet collateral set.",
    ],
    warnings: [
      "Morpho API has no SLA; fixture mode marks this as source-aware but not live.",
    ],
  },
  "euler-v2": {
    id: "euler-v2",
    label: "Euler V2",
    familyId: "euler-v2",
    familyLabel: "Euler V2",
    source: "Euler lens and vault fixture",
    sourceType: "on-chain",
    freshnessSeconds: 30,
    availableLiquidityUsd: 11_500_000,
    indicativeApr: 0.069,
    targetHealthFactor: 1.42,
    confidencePenalties: {
      sourcePenalty: 4,
      stalenessPenalty: 2,
      fallbackPenalty: 0,
      complexityPenalty: 18,
      liquidityPenalty: 1,
    },
    collateral: {
      WETH: {
        priceUsd: 3_460,
        ltv: 0.75,
        liquidationThreshold: 0.8,
        vaultId: "eWETH-1",
      },
      wstETH: {
        priceUsd: 3_940,
        ltv: 0.72,
        liquidationThreshold: 0.78,
        vaultId: "ewstETH-1",
      },
      WBTC: {
        priceUsd: 65_900,
        ltv: 0.68,
        liquidationThreshold: 0.74,
        vaultId: "eWBTC-1",
      },
      USDC: {
        priceUsd: 1,
        ltv: 0.82,
        liquidationThreshold: 0.86,
        vaultId: "eUSDC-1",
      },
      DAI: {
        priceUsd: 0.999,
        ltv: 0.8,
        liquidationThreshold: 0.84,
        vaultId: "eDAI-1",
      },
    },
    assumptions: [
      "Euler fixture approximates vault-specific borrow and liquidation LTVs from lens-style state.",
    ],
    warnings: [
      "Euler confidence is lower when pull-oracle freshness and controller relationships are not live-verified.",
    ],
  },
  "compound-iii": {
    id: "compound-iii",
    label: "Compound III",
    familyId: "compound-iii",
    familyLabel: "Compound III",
    source: "Compound Comet and Configurator fixture",
    sourceType: "on-chain",
    freshnessSeconds: 8,
    availableLiquidityUsd: 61_000_000,
    indicativeApr: 0.057,
    targetHealthFactor: 1.3,
    confidencePenalties: {
      sourcePenalty: 2,
      stalenessPenalty: 1,
      fallbackPenalty: 0,
      complexityPenalty: 3,
      liquidityPenalty: 0,
    },
    collateral: {
      WETH: {
        priceUsd: 3_470,
        ltv: 0.825,
        liquidationThreshold: 0.9,
        borrowCollateralFactor: 0.825,
        liquidateCollateralFactor: 0.9,
      },
      WBTC: {
        priceUsd: 66_050,
        ltv: 0.75,
        liquidationThreshold: 0.85,
        borrowCollateralFactor: 0.75,
        liquidateCollateralFactor: 0.85,
      },
    },
    assumptions: [
      "Compound fixture models the USDC Comet with per-collateral borrow and liquidate factors.",
    ],
    warnings: [],
  },
  sparklend: {
    id: "sparklend",
    label: "SparkLend",
    familyId: "sparklend",
    familyLabel: "SparkLend",
    source: "Spark UiPoolDataProviderV3 fixture",
    sourceType: "official-api",
    freshnessSeconds: 16,
    availableLiquidityUsd: 72_000_000,
    indicativeApr: 0.052,
    targetHealthFactor: 1.36,
    confidencePenalties: {
      sourcePenalty: 3,
      stalenessPenalty: 1,
      fallbackPenalty: 0,
      complexityPenalty: 6,
      liquidityPenalty: 0,
    },
    collateral: {
      WETH: { priceUsd: 3_474, ltv: 0.795, liquidationThreshold: 0.825 },
      wstETH: { priceUsd: 3_980, ltv: 0.78, liquidationThreshold: 0.81 },
      USDC: { priceUsd: 1, ltv: 0.77, liquidationThreshold: 0.8 },
      DAI: { priceUsd: 0.999, ltv: 0.75, liquidationThreshold: 0.79 },
      USDS: { priceUsd: 1, ltv: 0.78, liquidationThreshold: 0.81 },
    },
    assumptions: [
      "Spark fixture uses Aave-style health factor with Spark-specific oracle/cap caveats.",
    ],
    warnings: [
      "Spark oracle fallback status is represented as a fixture caveat, not live-verified.",
    ],
  },
};

export const existingDebtFixtures: Record<
  HexAddress,
  Record<string, number>
> = {
  [demoAddresses.existing]: {
    "aave-v3": 78_000,
    "aave-v4": 42_000,
    "morpho-blue": 65_000,
    "euler-v2": 49_000,
    "compound-iii": 36_000,
    sparklend: 58_000,
    own: 25_000,
  },
};

export const ownTerms = {
  12: 0.0875,
  24: 0.065,
  36: 0.1025,
} as const;

export const ownCaps = {
  capitalAvailabilityUsd: 2_500_000,
  maxTicketUsd: 750_000,
  targetConcentrationLimitUsd: 500_000,
};

export const deterministicScenarios: ScenarioDefinition[] = [
  {
    id: "eth-btc-spot-shock",
    label: "ETH/BTC spot shock",
    description: "Core ETH and BTC collateral draw down sharply.",
    collateralShock: {
      WETH: 0.28,
      wstETH: 0.3,
      WBTC: 0.24,
      cbBTC: 0.25,
      default: 0.05,
    },
    liquidityMultiplier: 0.9,
    aprShockBps: 150,
    confidencePenalty: 7,
  },
  {
    id: "lst-lrt-basis-widening",
    label: "LST/LRT basis widening",
    description: "Staked ETH derivatives trade below spot ETH.",
    collateralShock: { wstETH: 0.18, default: 0.02 },
    liquidityMultiplier: 0.95,
    aprShockBps: 75,
    confidencePenalty: 5,
  },
  {
    id: "stablecoin-depeg",
    label: "Stablecoin depeg",
    description: "Stablecoin collateral and borrow assets lose peg confidence.",
    collateralShock: { USDC: 0.08, DAI: 0.1, USDS: 0.07, default: 0 },
    liquidityMultiplier: 0.82,
    aprShockBps: 200,
    confidencePenalty: 8,
  },
  {
    id: "oracle-divergence-staleness",
    label: "Oracle divergence / staleness",
    description: "Protocol oracle state diverges from market discovery prices.",
    collateralShock: { default: 0.06 },
    liquidityMultiplier: 0.96,
    aprShockBps: 50,
    confidencePenalty: 12,
  },
  {
    id: "liquidity-withdrawal",
    label: "Liquidity withdrawal",
    description: "Borrowable liquidity leaves venues before execution.",
    collateralShock: { default: 0 },
    liquidityMultiplier: 0.45,
    aprShockBps: 100,
    confidencePenalty: 10,
  },
  {
    id: "rate-spike",
    label: "Rate spike",
    description: "Variable-rate utilisation increases materially.",
    collateralShock: { default: 0 },
    liquidityMultiplier: 0.9,
    aprShockBps: 500,
    confidencePenalty: 6,
  },
  {
    id: "combined-crash",
    label: "Combined crash",
    description: "Correlated price, rate, and liquidity shock.",
    collateralShock: {
      WETH: 0.38,
      wstETH: 0.42,
      WBTC: 0.34,
      cbBTC: 0.36,
      USDC: 0.06,
      DAI: 0.09,
      USDS: 0.08,
      default: 0.12,
    },
    liquidityMultiplier: 0.35,
    aprShockBps: 650,
    confidencePenalty: 18,
  },
  {
    id: "own-delinquency-lag",
    label: "OWN delinquency lag",
    description: "Fixed-term repayment delay reduces recovery coverage.",
    collateralShock: { default: 0.14 },
    liquidityMultiplier: 1,
    aprShockBps: 0,
    confidencePenalty: 9,
    protocolSafeBorrowMultiplier: {
      own: 0.78,
    },
  },
];

export const protocolMetadataFixtures: ProtocolMetadata[] = [
  metadataFor("own", "fixed", "none-assumed-own", [
    "Internal OWN term sheet and underwriting policy",
    "Internal collateral pricing and recovery assumptions",
  ]),
  metadataFor("aave-v3", "variable", "health-factor", [
    "Aave v3 official GraphQL",
    "On-chain reserve and user reads",
  ]),
  metadataFor("aave-v4", "variable", "health-factor", [
    "Aave v4 official GraphQL",
    "On-chain hub, spoke, and reserve reads",
  ]),
  metadataFor("morpho-blue", "variable", "ltv-threshold", [
    "Morpho official GraphQL",
    "Morpho SDK and direct market reads",
  ]),
  metadataFor("euler-v2", "variable", "vault-specific", [
    "Euler lens contracts",
    "Euler SDK simulation",
    "Direct vault and oracle reads",
  ]),
  metadataFor("compound-iii", "variable", "ltv-threshold", [
    "Compound Comet contract",
    "Compound Configurator and price feeds",
  ]),
  metadataFor("sparklend", "variable", "health-factor", [
    "Spark UiPoolDataProviderV3",
    "Spark oracle and cap utilities",
  ]),
];

function metadataFor(
  id: keyof typeof protocolFixtures,
  rateType: ProtocolMetadata["rateType"],
  liquidationRisk: ProtocolMetadata["liquidationRisk"],
  dataPriority: string[],
): ProtocolMetadata {
  const fixture = protocolFixtures[id];
  if (!fixture) {
    throw new Error(`Missing fixture for ${id}`);
  }

  return {
    id: fixture.id,
    label: fixture.label,
    familyId: fixture.familyId,
    familyLabel: fixture.familyLabel,
    supports: [1],
    targetBorrowAssets: id === "own" ? ["USD"] : ["USDC"],
    rateType,
    liquidationRisk,
    dataPriority,
    caveats: [...fixture.assumptions, ...fixture.warnings],
    status: "fixture-mode",
  };
}
