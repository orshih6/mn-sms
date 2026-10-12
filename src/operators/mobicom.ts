import { failure, type Transport, trimBase, withQuery } from "../transport";
import type { Gateway, MobicomConfig, WireRequest } from "../types";

/**
 * Mobicom's SMS MT gateway: a GET to `/smsmt/mt` with `servicename`,
 * `username`, `from`, `to` and `msg` in the query string. Cyrillic rides the
 * same endpoint as Latin, UTF-8 percent-encoded.
 *
 * The verdict is the BODY, not the status. The accepted answer is the bare
 * word `Sent`. The refusal vocabulary is not documented, so
 * everything that is not `Sent` — an error line, a proxy's HTML, an empty
 * body — counts as a refusal rather than being guessed at.
 */
export function createMobicomGateway(
  config: MobicomConfig,
  transport: Transport,
): Gateway {
  const url = `${trimBase(config.baseUrl)}/smsmt/mt`;

  return {
    name: "mobicom",

    async send(to, message) {
      const request: WireRequest = {
        method: "GET",
        url,
        params: {
          servicename: config.serviceName,
          from: config.from,
          to,
          msg: message,
        },
      };
      try {
        const response = await transport.fetch(
          withQuery(url, [
            ["servicename", config.serviceName],
            ["username", config.username],
            ["from", config.from],
            ["to", to],
            ["msg", message],
          ]),
          { method: "GET", signal: AbortSignal.timeout(transport.timeoutMs) },
        );
        const body = (await response.text()).trim();
        const ok = response.ok && /^sent\b/i.test(body);
        return {
          ok,
          statusCode: response.status,
          request,
          response: body,
          error: ok
            ? null
            : {
                code: "rejected",
                message:
                  body ||
                  `Mobicom answered HTTP ${response.status} with an empty body`,
              },
        };
      } catch (cause) {
        return failure(cause, request, [config.username], transport.timeoutMs);
      }
    },
  };
}
