import type {
  ProtocolMetadata,
  OwnLeadRequest,
  OwnLeadResponse,
  OwnLeadStatusResponse,
  PortfolioRequest,
  PortfolioResponse,
  QuoteRequest,
  QuoteResponse,
  ResolveRequest,
  ResolveResponse,
} from "@powerrr/shared-types";

export function usePowerrrApi() {
  return {
    protocols: () =>
      $fetch("/api/v2/protocols") as Promise<{
        protocols: ProtocolMetadata[];
      }>,
    resolve: (request: ResolveRequest) =>
      $fetch("/api/v1/resolve", {
        method: "POST",
        body: request,
      }) as Promise<ResolveResponse>,
    portfolio: (request: PortfolioRequest) =>
      $fetch("/api/v1/portfolio", {
        method: "POST",
        body: request,
      }) as Promise<PortfolioResponse>,
    quotes: (request: QuoteRequest, options: { refresh?: boolean } = {}) =>
      $fetch("/api/v2/quotes", {
        method: "POST",
        body: request,
        ...(options.refresh
          ? {
              headers: {
                "cache-control": "no-cache",
                "x-powerrr-refresh": "1",
              },
            }
          : {}),
      }) as Promise<QuoteResponse>,
    ownLeadStatus: () =>
      $fetch("/api/v1/own/leads/status") as Promise<OwnLeadStatusResponse>,
    submitOwnLead: (request: OwnLeadRequest) =>
      $fetch("/api/v1/own/leads", {
        method: "POST",
        body: request,
      }) as Promise<OwnLeadResponse>,
  };
}
