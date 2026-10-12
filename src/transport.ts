import type { GatewayOutcome, SmsClientOptions, WireRequest } from "./types";

export const DEFAULT_TIMEOUT_MS = 20_000;

export interface Transport {
  fetch: typeof fetch;
  timeoutMs: number;
}

export function resolveTransport(options: SmsClientOptions = {}): Transport {
  return {
    fetch: options.fetch ?? globalThis.fetch,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  };
}

export function trimBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

/**
 * Encoded by hand rather than through `URLSearchParams`, which serializes a
 * space as `+` (form-urlencoded rules). A gateway that plain percent-decodes
 * would then deliver those pluses inside the message text. `%20` decodes to a
 * space under both readings.
 */
export function withQuery(base: string, fields: [string, string][]): string {
  // Parse first, attach the credentials second: a malformed base then throws
  // from `new URL()` before any secret is part of a string, so none can ride
  // along on the thrown message.
  const url = new URL(base);
  url.search = fields
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");
  return url.toString();
}

/**
 * Turn a thrown fetch error into an outcome. Secrets are stripped from the
 * message regardless of how the URL was built, so a runtime that echoes the
 * request URL in its errors cannot leak them into a log.
 */
export function failure(
  cause: unknown,
  request: WireRequest,
  secrets: string[],
  timeoutMs: number,
): GatewayOutcome {
  const raw = cause instanceof Error ? cause.message : String(cause);
  const message = secrets
    .filter(Boolean)
    .reduce((text, secret) => text.split(secret).join("[redacted]"), raw);
  const timedOut =
    cause instanceof Error &&
    (cause.name === "TimeoutError" || cause.name === "AbortError");
  return {
    ok: false,
    statusCode: null,
    request,
    response: null,
    error: timedOut
      ? {
          code: "timeout",
          // The gateway said nothing, so the message may well be on its way.
          message: `no answer within ${timeoutMs}ms — delivery state is unknown`,
        }
      : { code: "network", message },
  };
}
