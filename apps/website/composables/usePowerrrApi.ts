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
      $fetch<{ protocols: ProtocolMetadata[] }>("/api/v2/protocols"),
    resolve: (request: ResolveRequest) =>
      $fetch<ResolveResponse>("/api/v1/resolve", {
        method: "POST",
        body: request,
      }),
    portfolio: (request: PortfolioRequest) =>
      $fetch<PortfolioResponse>("/api/v1/portfolio", {
        method: "POST",
        body: request,
      }),
    quotes: (request: QuoteRequest) =>
      $fetch<QuoteResponse>("/api/v2/quotes", {
        method: "POST",
        body: request,
      }),
    ownLeadStatus: () =>
      $fetch<OwnLeadStatusResponse>("/api/v1/own/leads/status"),
    submitOwnLead: (request: OwnLeadRequest) =>
      $fetch<OwnLeadResponse>("/api/v1/own/leads", {
        method: "POST",
        body: request,
      }),
  };
}
