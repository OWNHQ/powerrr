export default defineEventHandler(() => {
  const config = useRuntimeConfig();
  return ownLeadStatus(
    ownLeadDeliveryConfig(config as unknown as Record<string, unknown>),
  );
});
