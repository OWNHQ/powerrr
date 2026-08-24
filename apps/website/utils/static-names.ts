import {
  decodeFunctionResult,
  encodeFunctionData,
  getAddress,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { normalize } from "viem/ens";
import type { Eip1193Provider } from "./static-discovery";

export const ENS_UNIVERSAL_RESOLVER =
  "0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe" as const;
export const GNS_NAME_NFT =
  "0x9D51D507BC7264d4fE8Ad1cf7Fe191933A0a81d6" as const;

export type WalletNames = {
  ensName: string | null;
  gweiName: string | null;
};

const ensReverseAbi = [
  {
    type: "function",
    name: "reverse",
    stateMutability: "view",
    inputs: [
      { name: "lookupAddress", type: "bytes" },
      { name: "coinType", type: "uint256" },
    ],
    outputs: [
      { name: "primary", type: "string" },
      { name: "resolver", type: "address" },
      { name: "reverseResolver", type: "address" },
    ],
  },
] as const;

const gnsReverseAbi = [
  {
    type: "function",
    name: "reverseResolve",
    stateMutability: "view",
    inputs: [{ name: "addr", type: "address" }],
    outputs: [{ name: "name", type: "string" }],
  },
] as const;

export async function resolveWalletNames(input: {
  provider: Eip1193Provider;
  account: string;
  blockNumber: string;
}): Promise<WalletNames> {
  const account = getAddress(input.account);
  const blockTag = toHex(BigInt(input.blockNumber));
  const [ensName, gweiName] = await Promise.all([
    readEnsName(input.provider, account, blockTag),
    readGweiName(input.provider, account, blockTag),
  ]);
  return { ensName, gweiName };
}

async function readEnsName(
  provider: Eip1193Provider,
  account: Address,
  blockTag: Hex,
): Promise<string | null> {
  try {
    const data = await ethCall(
      provider,
      ENS_UNIVERSAL_RESOLVER,
      encodeFunctionData({
        abi: ensReverseAbi,
        functionName: "reverse",
        args: [account, 60n],
      }),
      blockTag,
    );
    const [name] = decodeFunctionResult({
      abi: ensReverseAbi,
      functionName: "reverse",
      data,
    });
    return safeName(name);
  } catch {
    // OffchainLookup and all other resolver failures deliberately fail closed.
    return null;
  }
}

async function readGweiName(
  provider: Eip1193Provider,
  account: Address,
  blockTag: Hex,
): Promise<string | null> {
  try {
    const data = await ethCall(
      provider,
      GNS_NAME_NFT,
      encodeFunctionData({
        abi: gnsReverseAbi,
        functionName: "reverseResolve",
        args: [account],
      }),
      blockTag,
    );
    const name = decodeFunctionResult({
      abi: gnsReverseAbi,
      functionName: "reverseResolve",
      data,
    });
    const normalized = safeName(name);
    return normalized?.endsWith(".gwei") ? normalized : null;
  } catch {
    return null;
  }
}

async function ethCall(
  provider: Eip1193Provider,
  to: Address,
  data: Hex,
  blockTag: Hex,
): Promise<Hex> {
  return provider.request<Hex>({
    method: "eth_call",
    params: [{ to, data }, blockTag],
  });
}

function safeName(value: string): string | null {
  const candidate = value.trim();
  if (!candidate || candidate.length > 255 || !candidate.includes(".")) {
    return null;
  }
  try {
    return normalize(candidate);
  } catch {
    return null;
  }
}
