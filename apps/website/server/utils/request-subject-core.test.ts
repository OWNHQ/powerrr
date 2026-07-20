import { describe, expect, it } from "vitest";
import { addressInputRateLimitSubject } from "./request-subject-core.js";

describe("request rate-limit subject extraction", () => {
  it("normalizes address and ENS subjects", () => {
    expect(
      addressInputRateLimitSubject({
        input: { address: "  0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD  " },
      }),
    ).toBe("0xabcdefabcdefabcdefabcdefabcdefabcdefabcd");
    expect(
      addressInputRateLimitSubject({ input: { ensName: " Powerrr.ETH " } }),
    ).toBe("powerrr.eth");
  });

  it("falls back to anonymous rate limiting for malformed request shapes", () => {
    expect(addressInputRateLimitSubject(null)).toBeUndefined();
    expect(addressInputRateLimitSubject({})).toBeUndefined();
    expect(addressInputRateLimitSubject({ input: null })).toBeUndefined();
    expect(
      addressInputRateLimitSubject({ input: { address: 42 } }),
    ).toBeUndefined();
  });
});
