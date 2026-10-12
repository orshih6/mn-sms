import { failure, type Transport, trimBase } from "../transport";
import type { Gateway, UnitelConfig, WireRequest } from "../types";

const DEFAULT_BASE_URL = "https://pn.unitel.mn";

/**
 * Unitel's PN send API: POST a JSON body to `/api/message/send/sms` with the
 * API key as the `enc` query parameter. The manual also offers a query-string
 * variant (`/sms/q`); the JSON body is used because Cyrillic survives it
 * intact, so there is no alphabet fork.
 *
 * The response body is not documented, so the HTTP status is the verdict and
 * the body is handed back verbatim.
 */
export function createUnitelGateway(
  config: UnitelConfig,
  transport: Transport,
): Gateway {
  const endpoint = `${trimBase(config.baseUrl ?? DEFAULT_BASE_URL)}/api/message/send/sms`;

  return {
    name: "unitel",

    async send(to, message) {
      const request: WireRequest = {
        method: "POST",
        url: endpoint,
        params: { to, message },
      };
      try {
        const url = new URL(endpoint);
        url.searchParams.set("enc", config.apiKey);
        const response = await transport.fetch(url.toString(), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ to, message }),
          signal: AbortSignal.timeout(transport.timeoutMs),
        });
        const text = await response.text();
        let body: unknown = text;
        try {
          body = JSON.parse(text);
        } catch {
          // Non-JSON stays text.
        }
        const ok = response.ok;
        return {
          ok,
          statusCode: response.status,
          request,
          response: body,
          error: ok
            ? null
            : {
                code: "rejected",
                message: `Unitel answered HTTP ${response.status}`,
                gatewayCode: String(response.status),
              },
        };
      } catch (cause) {
        return failure(cause, request, [config.apiKey], transport.timeoutMs);
      }
    },
  };
}
