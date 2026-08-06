import { getAddress, isAddress } from "viem";

export function formatCompactWalletAddress(address: string): string {
  if (!isAddress(address)) return "";

  const checksummed = getAddress(address);
  return `${checksummed.slice(0, 6)}...${checksummed.slice(-4)}`;
}

export function formatWalletIdentityLabel(
  resolvedNames: readonly string[],
  compactAddress: string,
): string {
  return resolvedNames.find(Boolean) ?? compactAddress;
}
