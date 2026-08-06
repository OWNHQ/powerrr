import { describe, expect, it } from "vitest";
import {
  formatCompactWalletAddress,
  formatWalletIdentityLabel,
} from "./wallet-identity";

describe("wallet identity formatting", () => {
  it("uses a resolved name without appending the address", () => {
    expect(formatWalletIdentityLabel(["vitalik.eth"], "0xd8dA...6045")).toBe(
      "vitalik.eth",
    );
  });

  it("falls back to an EIP-55 checksummed compact address", () => {
    expect(
      formatCompactWalletAddress("0xd8da6bf26964af9d7eed9e03e53415d37aa96045"),
    ).toBe("0xd8dA...6045");
    expect(formatWalletIdentityLabel([], "0xd8dA...6045")).toBe(
      "0xd8dA...6045",
    );
  });

  it("does not format invalid provider output as an address", () => {
    expect(formatCompactWalletAddress("not-an-address")).toBe("");
  });
});
