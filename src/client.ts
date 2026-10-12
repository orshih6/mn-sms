import { gatewayFor, normalizePhone, operatorFor } from "./numbering";
import { createGmobileGateway } from "./operators/gmobile";
import { createMobicomGateway } from "./operators/mobicom";
import { createSkytelGateway } from "./operators/skytel";
import { createUnitelGateway } from "./operators/unitel";
import { resolveTransport } from "./transport";
import type {
  Gateway,
  GatewayName,
  SendInput,
  SmsClientConfig,
  SmsClientOptions,
  SmsError,
  SmsResult,
} from "./types";

export interface SmsClient {
  /** The gateways this client was given config for. */
  readonly gateways: readonly GatewayName[];
  /**
   * Send one SMS. Never throws for a failed send — every outcome, including a
   * refused number or an unreachable gateway, comes back as a result with
   * `ok: false` and an `error.code`.
   */
  send(input: SendInput): Promise<SmsResult>;
  /**
   * The checks `send()` runs before any network call, on their own: is the
   * number valid, routable and configured, and does the message fit? Returns
   * null when the send would go out.
   */
  check(input: SendInput): SmsError | null;
}

export function createSmsClient(
  config: SmsClientConfig,
  options?: SmsClientOptions,
): SmsClient {
  const transport = resolveTransport(options);
  const gateways: Partial<Record<GatewayName, Gateway>> = {};
  if (config.unitel)
    gateways.unitel = createUnitelGateway(config.unitel, transport);
  if (config.skytel)
    gateways.skytel = createSkytelGateway(config.skytel, transport);
  if (config.mobicom)
    gateways.mobicom = createMobicomGateway(config.mobicom, transport);
  if (config.gmobile)
    gateways.gmobile = createGmobileGateway(config.gmobile, transport);

  function plan(input: SendInput) {
    const to = normalizePhone(input.to);
    const operator = to ? operatorFor(to) : null;
    const gatewayName = input.operator ?? (to ? gatewayFor(to) : null);
    const gateway = gatewayName ? gateways[gatewayName] : undefined;
    return { to, operator, gatewayName, gateway, error: refusal() };

    function refusal(): SmsError | null {
      if (!to)
        return {
          code: "invalid_number",
          message: "must be an 8-digit Mongolian subscriber number",
        };
      if (!gatewayName)
        return operator
          ? {
              code: "unsupported_operator",
              message: `operator "${operator}" has no gateway in this package`,
            }
          : {
              code: "unallocated_number",
              message: `${to} is not in any Mongolian mobile number range`,
            };
      if (!gateway)
        return {
          code: "not_configured",
          message: `${to} routes to ${gatewayName}, which this client has no config for`,
        };
      if (input.message.length === 0)
        return { code: "empty_message", message: "message is empty" };
      // The ceiling is the ROUTED gateway's, so a message that fits one
      // operator can be too long for another's number. Refusing here costs no
      // gateway call, where the gateway would answer an ambiguous error — or
      // quietly deliver half an OTP.
      if (
        gateway.maxLength !== undefined &&
        input.message.length > gateway.maxLength
      )
        return {
          code: "message_too_long",
          message: `${gatewayName} accepts at most ${gateway.maxLength} characters`,
        };
      return null;
    }
  }

  return {
    gateways: Object.keys(gateways) as GatewayName[],

    check(input) {
      return plan(input).error;
    },

    async send(input) {
      const { to, operator, gatewayName, gateway, error } = plan(input);
      const head = {
        to: to ?? input.to,
        operator,
        gateway: gatewayName,
      };
      if (error || !gateway || !to)
        return {
          ...head,
          ok: false,
          statusCode: null,
          request: null,
          response: null,
          error,
        };
      return { ...head, ...(await gateway.send(to, input.message)) };
    },
  };
}
