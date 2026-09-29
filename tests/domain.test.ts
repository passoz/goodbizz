import { describe, expect, test } from "bun:test";

import {
  ArtifactError,
  ConfigError,
  DeciderError,
  DomainError,
  LlmError,
  NotFoundError,
  ValidationError,
} from "../src/domain/errors.ts";

describe("domain errors", () => {
  test("carry a stable code and the HTTP status the edge maps them to", () => {
    const cases: Array<[DomainError, string, number]> = [
      [new ConfigError("no key"), "CONFIG_INVALID", 500],
      [new ValidationError("bad payload"), "VALIDATION_FAILED", 422],
      [new NotFoundError("missing study"), "NOT_FOUND", 404],
      [new LlmError("provider down"), "LLM_FAILED", 502],
      [new DeciderError("provider down"), "DECIDER_FAILED", 502],
      [new ArtifactError("disk full"), "ARTIFACT_FAILED", 500],
    ];
    for (const [error, code, status] of cases) {
      expect(error.code).toBe(code);
      expect(error.status).toBe(status);
      expect(error).toBeInstanceOf(DomainError);
      expect(error).toBeInstanceOf(Error);
    }
  });

  test("uses the concrete class name and keeps validation details", () => {
    const error = new ValidationError("payload rejected", { field: "niche" });
    expect(error.name).toBe("ValidationError");
    expect(error.details).toEqual({ field: "niche" });
    expect(error.status).toBe(422);
  });
});
