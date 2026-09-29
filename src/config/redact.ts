/**
 * Secret redaction. Any value that came from the environment as a credential is replaced
 * before a message can reach a log line, an HTTP body or an artifact.
 */

const REDACTED = "[redacted]";

/** Replace every occurrence of every known secret with a placeholder. */
export function redactSecrets(text: string, secrets: readonly string[] = []): string {
  let output = text;
  for (const secret of secrets) {
    if (secret.length < 4) continue;
    output = output.split(secret).join(REDACTED);
  }
  return output;
}

/** Credential-shaped substrings that must never survive into a message. */
const CREDENTIAL_PATTERNS: readonly RegExp[] = [
  /\b(?:sk|rk|pk|lsk|lsv2)[-_][A-Za-z0-9-_]{8,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\b(?:api[-_]?key|token|secret)\s*[:=]\s*\S{8,}/gi,
];

/** Redact credential-shaped values even when the caller did not pass the secret list. */
export function redactCredentials(text: string): string {
  let output = text;
  for (const pattern of CREDENTIAL_PATTERNS) {
    output = output.replace(pattern, REDACTED);
  }
  return output;
}

/** Combine both passes: known secrets first, then credential-shaped leftovers. */
export function scrub(text: string, secrets: readonly string[] = []): string {
  return redactCredentials(redactSecrets(text, secrets));
}
