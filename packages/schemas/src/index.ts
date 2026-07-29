import { z } from "zod";

export const EthereumAddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Expected a 20-byte Ethereum address");

export const EnsNameSchema = z
  .string()
  .trim()
  .min(3)
  .max(255)
  .refine((value) => value.includes("."), "Expected an ENS name");

export const ChainIdSchema = z.literal(1, {
  errorMap: () => ({
    message: "Only Ethereum mainnet is supported in this build",
  }),
});

export const AddressOrEnsInputSchema = z
  .object({
    address: EthereumAddressSchema.optional(),
    ensName: EnsNameSchema.optional(),
  })
  .strict()
  .refine((input) => Boolean(input.address) !== Boolean(input.ensName), {
    message: "Provide exactly one of address or ensName",
  });

export const ResolveRequestSchema = z
  .object({
    chainId: ChainIdSchema,
    input: AddressOrEnsInputSchema,
  })
  .strict();

export const QuoteModeSchema = z.enum(["wallet-estimate", "existing-position"]);
export const SafetyProfileSchema = z.enum(["max", "balanced", "conservative"]);
export const ScenarioIdSchema = z.enum([
  "eth-btc-spot-shock",
  "lst-lrt-basis-widening",
  "stablecoin-depeg",
  "oracle-divergence-staleness",
  "liquidity-withdrawal",
  "rate-spike",
  "combined-crash",
  "own-delinquency-lag",
]);

export const QuoteRequestSchema = ResolveRequestSchema.extend({
  mode: QuoteModeSchema,
  targetBorrowAssets: z
    .array(z.string().min(2).max(16))
    .min(1)
    .max(8)
    .optional(),
  collateralTokens: z
    .array(EthereumAddressSchema)
    .min(1)
    .max(32)
    .refine(
      (tokens) =>
        new Set(tokens.map((token) => token.toLowerCase())).size ===
        tokens.length,
      "Collateral token addresses must be unique",
    )
    .optional(),
  safetyProfile: SafetyProfileSchema.optional(),
  includeProtocols: z
    .array(z.string().min(2).max(64))
    .min(1)
    .max(16)
    .optional(),
  asOfBlock: z
    .string()
    .regex(/^[0-9]+$/)
    .nullable()
    .optional(),
}).strict();

export const PortfolioRequestSchema = ResolveRequestSchema;

export const OwnRiskRequestSchema = ResolveRequestSchema.extend({
  requestedPrincipalUsd: z.number().positive().max(10_000_000).optional(),
  termMonths: z.union([z.literal(12), z.literal(24), z.literal(36)]).optional(),
}).strict();

export const OwnLeadRequestSchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    email: z.string().trim().email().max(254),
    wallet: z.union([EthereumAddressSchema, EnsNameSchema]),
    requestedAmountUsd: z.number().positive().max(10_000_000),
    creditAsset: z.literal("USDC"),
    termMonths: z.number().int().min(1).max(120),
    collateral: z
      .array(
        z
          .object({
            symbol: z.string().trim().min(2).max(24),
            valueUsd: z.number().nonnegative().max(1_000_000_000),
          })
          .strict(),
      )
      .min(1)
      .max(32),
    policyVersion: z.string().trim().min(1).max(96),
    consent: z.literal(true),
    website: z.string().max(200).optional(),
  })
  .strict();

export const SimulationRequestSchema = QuoteRequestSchema.extend({
  scenarioIds: z.array(ScenarioIdSchema).min(1).max(8).optional(),
}).strict();

export const EvidenceStatusSchema = z.enum(["verified", "stated", "missing"]);
export const EmploymentStatusSchema = z.enum([
  "employed",
  "self-employed",
  "contract",
  "retired",
  "unemployed",
  "other",
]);
export const BorrowerScenarioIdSchema = z.enum([
  "collateral-crash",
  "income-loss",
  "rate-shock",
  "liquidity-freeze",
  "combined-stress",
]);

export const BorrowerRiskAssessmentRequestSchema = z
  .object({
    applicationId: z.string().trim().min(1).max(128).optional(),
    borrower: z
      .object({
        financials: z
          .object({
            annualGrossIncomeUsd: z.number().nonnegative().max(100_000_000),
            monthlyNetIncomeUsd: z
              .number()
              .nonnegative()
              .max(10_000_000)
              .optional(),
            monthlyDebtPaymentsUsd: z.number().nonnegative().max(10_000_000),
            monthlyLivingExpensesUsd: z.number().nonnegative().max(10_000_000),
            employmentStatus: EmploymentStatusSchema,
            incomeEvidence: EvidenceStatusSchema,
          })
          .strict(),
        credit: z
          .object({
            creditScore: z.number().int().min(0).max(10_000).optional(),
            creditScoreScale: z.string().trim().min(1).max(64).optional(),
            missedPayments24m: z.number().int().nonnegative().max(240),
            defaultsOrCollections: z.number().int().nonnegative().max(100),
            activeBankruptcy: z.boolean(),
            creditEvidence: EvidenceStatusSchema,
          })
          .strict(),
      })
      .strict(),
    facility: z
      .object({
        requestedPrincipalUsd: z.number().positive().max(100_000_000),
        annualRate: z.number().min(0).max(1),
        durationMonths: z.number().int().min(3).max(360),
        repaymentType: z.literal("amortizing"),
        creditToken: z.string().trim().min(2).max(16),
      })
      .strict(),
    collateral: z
      .object({
        asset: z.string().trim().min(2).max(16),
        amount: z.number().positive().max(1_000_000_000),
        spotPriceUsd: z.number().positive().max(100_000_000),
        annualVolatility: z.number().min(0).max(5),
        maxDrawdown365d: z.number().min(0).max(1),
        volume24hUsd: z.number().nonnegative().max(100_000_000_000_000),
        custodyModel: z.enum([
          "self-custody",
          "qualified-custodian",
          "third-party",
        ]),
        oracleModel: z.enum([
          "protocol-native",
          "multi-source",
          "single-source",
          "manual",
        ]),
        hedgeFloorUsd: z.number().nonnegative().max(100_000_000).optional(),
        marketEvidence: EvidenceStatusSchema,
      })
      .strict(),
    policyVersion: z.string().trim().min(1).max(64).optional(),
  })
  .strict();

export const BorrowerRiskScenarioRequestSchema = z
  .object({
    assessment: BorrowerRiskAssessmentRequestSchema,
    scenarioIds: z.array(BorrowerScenarioIdSchema).min(1).max(5).optional(),
  })
  .strict();

export type ParsedResolveRequest = z.infer<typeof ResolveRequestSchema>;
export type ParsedQuoteRequest = z.infer<typeof QuoteRequestSchema>;
export type ParsedOwnRiskRequest = z.infer<typeof OwnRiskRequestSchema>;
export type ParsedOwnLeadRequest = z.infer<typeof OwnLeadRequestSchema>;
export type ParsedSimulationRequest = z.infer<typeof SimulationRequestSchema>;
export type ParsedBorrowerRiskAssessmentRequest = z.infer<
  typeof BorrowerRiskAssessmentRequestSchema
>;
export type ParsedBorrowerRiskScenarioRequest = z.infer<
  typeof BorrowerRiskScenarioRequestSchema
>;
