import { describe, expect, test } from "bun:test";

import { redactCredentials, redactSecrets, scrub } from "../src/config/redact.ts";

describe("secret redaction", () => {
  test("replaces every occurrence of a known secret", () => {
    const secret = "lsk_live_abcdef123456";
    const message = `decider rejected request: Authorization Bearer ${secret} and ${secret} again`;
    const redacted = redactSecrets(message, [secret]);
    expect(redacted).not.toContain(secret);
    expect(redacted).toContain("[redacted]");
    expect(redacted.match(/\[redacted\]/g)).toHaveLength(2);
  });

  test("ignores fragments too short to be secrets", () => {
    expect(redactSecrets("key=ab value", ["ab"])).toBe("key=ab value");
    expect(redactSecrets("key=abcd value", ["abcd"])).toBe("key=[redacted] value");
  });

  test("catches credential-shaped leftovers the caller did not list", () => {
    const text = "used sk-proj-ABCdef0123456789 and api_key=supersecretvalue";
    const redacted = redactCredentials(text);
    expect(redacted).not.toContain("sk-proj-ABCdef0123456789");
    expect(redacted).not.toContain("supersecretvalue");
  });

  test("scrub applies both passes", () => {
    const secret = "custom-secret-value-9";
    const text = `call with ${secret} and sk-live-ABCDEF0123456789`;
    const clean = scrub(text, [secret]);
    expect(clean).not.toContain(secret);
    expect(clean).not.toContain("sk-live-ABCDEF0123456789");
  });
});
