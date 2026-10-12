import { failure, type Transport, trimBase, withQuery } from "../transport";
import type { Gateway, GmobileConfig, WireRequest } from "../types";

const DEFAULT_BASE_URL = "http://sms-special.gmobile.mn";

/** The refusal tokens G-Mobile's API guide lists. Opaque on their own. */
export const GMOBILE_ERRORS: Readonly<Record<string, string>> = {
  error1: "a required parameter was not sent",
  error2: "the special (sender) number does not exist",
  error3: "the request came from an IP address that is not allowed",
  error4: "this account's right to send has been closed",
  error5: "the recipient's number is invalid",
  error6: "the text is longer than 160 characters",
};

/**
 * G-Mobile's special-number gateway: a GET to `/cgi-bin/sendsms` with
 * `username`, `password`, `from`, `to` and `text` in the query string.
 * Cyrillic rides the same endpoint as Latin, UTF-8 percent-encoded.
 *
 * The verdict is the BODY, not the status: acceptance is the line
 * `0: Accepted for delivery` and every refusal is a bare `errorN` token.
 *
 * The acceptance line is Kannel's, which can also answer
 * `3: Queued for later delivery`. The guide does not list that, so it is not
 * treated as accepted: an unlisted answer is a refusal, not a guess.
 */
export function createGmobileGateway(
  config: GmobileConfig,
  transport: Transport,
): Gateway {
  const url = `${trimBase(config.baseUrl ?? DEFAULT_BASE_URL)}/cgi-bin/sendsms`;

  return {
    name: "gmobile",
    maxLength: 160,

    async send(to, message) {
      const request: WireRequest = {
        method: "GET",
        url,
        params: { from: config.from, to, text: message },
      };
      try {
        const response = await transport.fetch(
          withQuery(url, [
            ["username", config.username],
            ["password", config.password],
            ["from", config.from],
            ["to", to],
            ["text", message],
          ]),
          { method: "GET", signal: AbortSignal.timeout(transport.timeoutMs) },
        );
        const body = (await response.text()).trim();
        const ok = response.ok && /^0:\s*accepted\b/i.test(body);
        const gatewayCode = /^error\d+$/i.exec(body)?.[0].toLowerCase();
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
                  (gatewayCode && GMOBILE_ERRORS[gatewayCode]) ||
                  body ||
                  `G-Mobile answered HTTP ${response.status} with an empty body`,
                ...(gatewayCode ? { gatewayCode } : {}),
              },
        };
      } catch (cause) {
        return failure(
          cause,
          request,
          [config.username, config.password],
          transport.timeoutMs,
        );
      }
    },
  };
}
