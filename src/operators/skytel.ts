import { failure, type Transport, trimBase, withQuery } from "../transport";
import type { Gateway, SkytelConfig, WireRequest } from "../types";

const DEFAULT_BASE_URL = "https://smsgw.skytel.mn";

/** The refusal codes Skytel's PushSMS manual lists. */
export const SKYTEL_ERRORS: Readonly<Record<string, string>> = {
  "101": "a required parameter is missing",
  "102": "invalid src (sender) number",
  "103": "invalid dest (recipient) number",
  "201": "invalid parameter(s)",
  "202": "not authenticated — wrong id, or the calling IP is not on the Allowed IP List",
  "203": "account disabled",
  "206": "recipient is on another network — this gateway only delivers to Skytel numbers",
  "207": "src is not the sender number registered to this account",
};

/**
 * Latin and Cyrillic are different endpoints: `/pushsms` carries ASCII, and
 * anything else has to go to `/unicode` or the subscriber gets mojibake.
 * Chosen from the text rather than from a caller flag.
 */
function endpointFor(text: string): "pushsms" | "unicode" {
  const latinOnly = [...text].every((ch) => (ch.codePointAt(0) ?? 0) < 128);
  return latinOnly ? "pushsms" : "unicode";
}

/**
 * Skytel's SMSGW PushSMS API: a GET with `id`, `src`, `dest` and `text` in the
 * query string.
 *
 * The verdict is the BODY, not the status: Skytel answers `200 OK` with a
 * plain-text `OK` on acceptance and `ERROR: <code> <reason>` on refusal, so a
 * status-only check would count every rejected send as delivered.
 */
export function createSkytelGateway(
  config: SkytelConfig,
  transport: Transport,
): Gateway {
  const base = `${trimBase(config.baseUrl ?? DEFAULT_BASE_URL)}/SMSGW-war`;

  return {
    name: "skytel",
    maxLength: 160,

    async send(to, message) {
      const url = `${base}/${endpointFor(message)}`;
      const request: WireRequest = {
        method: "GET",
        url,
        params: { src: config.src, dest: to, text: message },
      };
      try {
        const response = await transport.fetch(
          withQuery(url, [
            ["id", config.id],
            ["src", config.src],
            ["dest", to],
            ["text", message],
          ]),
          { method: "GET", signal: AbortSignal.timeout(transport.timeoutMs) },
        );
        const body = (await response.text()).trim();
        const ok = response.ok && /^ok\b/i.test(body);
        const gatewayCode = /^ERROR:\s*(\d+)/i.exec(body)?.[1];
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
                  (gatewayCode && SKYTEL_ERRORS[gatewayCode]) ||
                  body ||
                  `Skytel answered HTTP ${response.status} with an empty body`,
                ...(gatewayCode ? { gatewayCode } : {}),
              },
        };
      } catch (cause) {
        return failure(cause, request, [config.id], transport.timeoutMs);
      }
    },
  };
}
