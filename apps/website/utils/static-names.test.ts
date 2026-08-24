import { decodeFunctionData, encodeFunctionResult, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import type { Eip1193Provider, Eip1193Request } from "./static-discovery";
import {
  ENS_UNIVERSAL_RESOLVER,
  GNS_NAME_NFT,
  resolveWalletNames,
} from "./static-names";

const account = "0x00000000000000000000000000000000000000A1";
const zeroAddress = "0x0000000000000000000000000000000000000000";

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

describe("wallet-provider name resolution", () => {
  it("resolves verified ENS and .gwei primary names at the pinned block", async () => {
    const calls: Array<{ to: string; data: Hex; blockTag: string }> = [];
    const provider: Eip1193Provider = {
      async request<TResult>(request: Eip1193Request): Promise<TResult> {
        expect(request.method).toBe("eth_call");
        const [call, blockTag] = request.params as readonly [
          { to: string; data: Hex },
          string,
        ];
        calls.push({ ...call, blockTag });
        if (call.to.toLowerCase() === ENS_UNIVERSAL_RESOLVER.toLowerCase()) {
          const decoded = decodeFunctionData({
            abi: ensReverseAbi,
            data: call.data,
          });
          expect(decoded.args[0].toLowerCase()).toBe(account.toLowerCase());
          expect(decoded.args[1]).toBe(60n);
          return encodeFunctionResult({
            abi: ensReverseAbi,
            functionName: "reverse",
            result: ["Powerrr.ETH", zeroAddress, zeroAddress],
          }) as TResult;
        }
        expect(call.to.toLowerCase()).toBe(GNS_NAME_NFT.toLowerCase());
        expect(
          decodeFunctionData({ abi: gnsReverseAbi, data: call.data }).args,
        ).toEqual([account]);
        return encodeFunctionResult({
          abi: gnsReverseAbi,
          functionName: "reverseResolve",
          result: "powerrr.gwei",
        }) as TResult;
      },
    };

    await expect(
      resolveWalletNames({ provider, account, blockNumber: "4660" }),
    ).resolves.toEqual({
      ensName: "powerrr.eth",
      gweiName: "powerrr.gwei",
    });
    expect(calls).toHaveLength(2);
    expect(calls.every((call) => call.blockTag === "0x1234")).toBe(true);
  });

  it("fails closed independently for unavailable, offchain, or invalid names", async () => {
    const provider: Eip1193Provider = {
      async request<TResult>(request: Eip1193Request): Promise<TResult> {
        const [call] = request.params as readonly [{ to: string; data: Hex }];
        if (call.to.toLowerCase() === ENS_UNIVERSAL_RESOLVER.toLowerCase()) {
          throw new Error("OffchainLookup");
        }
        return encodeFunctionResult({
          abi: gnsReverseAbi,
          functionName: "reverseResolve",
          result: "not-a-gwei-name.eth",
        }) as TResult;
      },
    };

    await expect(
      resolveWalletNames({ provider, account, blockNumber: "4660" }),
    ).resolves.toEqual({ ensName: null, gweiName: null });
  });
});
