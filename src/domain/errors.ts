/**
 * Domain errors. Each carries a stable code and the HTTP status the edge should map it to.
 * Messages must never contain credentials — callers redact before raising.
 */

export class DomainError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 422) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.status = status;
  }
}

export class ConfigError extends DomainError {
  constructor(message: string) {
    super("CONFIG_INVALID", message, 500);
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, details?: unknown) {
    super("VALIDATION_FAILED", message, 422);
    if (details !== undefined) this.details = details;
  }

  details?: unknown;
}

export class NotFoundError extends DomainError {
  constructor(message: string) {
    super("NOT_FOUND", message, 404);
  }
}

export class LlmError extends DomainError {
  constructor(message: string) {
    super("LLM_FAILED", message, 502);
  }
}

export class DeciderError extends DomainError {
  constructor(message: string) {
    super("DECIDER_FAILED", message, 502);
  }
}

export class ArtifactError extends DomainError {
  constructor(message: string) {
    super("ARTIFACT_FAILED", message, 500);
  }
}
