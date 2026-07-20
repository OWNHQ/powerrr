export default defineEventHandler(async (event) => {
  return handleQuoteRequest(event, { deprecated: true });
});
