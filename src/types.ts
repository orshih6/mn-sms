/** A carrier that owns Mongolian mobile numbers. */
export type Operator = "unitel" | "skytel" | "mobicom" | "gmobile" | "ondo";

/**
 * An operator this package can send through. ONDO owns number ranges but has
 * no gateway implemented here, so it is an `Operator` and not a `GatewayName`.
 */
export type GatewayName = "unitel" | "skytel" | "mobicom" | "gmobile";

export interface UnitelConfig {
  /** pn.unitel.mn → Settings → API key. Shown once when the key is created. */
  apiKey: string;
  /** Defaults to `https://pn.unitel.mn`. */
  baseUrl?: string;
}

export interface SkytelConfig {
  /** The registration number ("бүртгэлийн дугаар") from the account letter. */
  id: string;
  /** Your sender short number. Fixed per account. */
  src: string;
  /** Defaults to `https://smsgw.skytel.mn`. */
  baseUrl?: string;
}

export interface MobicomConfig {
  /**
   * The gateway address from your account letter, scheme included
   * (e.g. `http://<host>`). There is no default: Mobicom hands the address out
   * with the account.
   */
  baseUrl: string;
  /** The `servicename` value from the account letter. */
  serviceName: string;
  /** The account name. There is no password; the source IP is the other half. */
  username: string;
  /** Your sender short number. Fixed per account. */
  from: string;
}

export interface GmobileConfig {
  username: string;
  password: string;
  /** Your "special number" ("тусгай дугаар") — the sender short number. */
  from: string;
  /** Defaults to `http://sms-special.gmobile.mn`. */
  baseUrl?: string;
}

/** Configure only the operators you hold an account with. */
export interface SmsClientConfig {
  unitel?: UnitelConfig;
  skytel?: SkytelConfig;
  mobicom?: MobicomConfig;
  gmobile?: GmobileConfig;
}

export interface SmsClientOptions {
  /** Defaults to the global `fetch`. Inject one for tests or a proxy. */
  fetch?: typeof fetch;
  /**
   * How long to wait for a gateway before giving up. Defaults to 20 000 —
   * the ceiling Skytel documents, applied to every operator.
   */
  timeoutMs?: number;
}

export interface SendInput {
  /**
   * The recipient. An 8-digit subscriber number; `+976`, `976` and `00976`
   * prefixes and spaces/dashes are accepted and stripped.
   */
  to: string;
  message: string;
  /**
   * Skip number-range routing and send through this operator's gateway. The
   * escape hatch for a ported number, which keeps its original range.
   */
  operator?: GatewayName;
}

export type SmsErrorCode =
  /** `to` is not an 8-digit Mongolian subscriber number. */
  | "invalid_number"
  /** The number is in no operator's allocated range. */
  | "unallocated_number"
  /** The number belongs to an operator with no gateway here (ONDO). */
  | "unsupported_operator"
  /** The number's operator has a gateway, but you gave no config for it. */
  | "not_configured"
  | "empty_message"
  /** Longer than the routed gateway accepts in one message. */
  | "message_too_long"
  /** The gateway answered and refused. `gatewayCode` says why, when it does. */
  | "rejected"
  /** No answer in time. ⚠️ The delivery state is UNKNOWN, not failed. */
  | "timeout"
  /** The request never completed (DNS, connection refused, bad base URL…). */
  | "network";

export interface SmsError {
  code: SmsErrorCode;
  message: string;
  /** The gateway's own refusal code: Skytel's `202`, G-Mobile's `error3`. */
  gatewayCode?: string;
}

/** What was put on the wire, with every credential left out. */
export interface WireRequest {
  method: "GET" | "POST";
  url: string;
  params: Record<string, string>;
}

export interface SmsResult {
  ok: boolean;
  /** The normalized 8-digit number, or the input as given if it was invalid. */
  to: string;
  /** Who owns the number, by range. Null if nobody does. */
  operator: Operator | null;
  /** The gateway the send went to (or would have). Null if none was reached. */
  gateway: GatewayName | null;
  /** The gateway's HTTP status. Null if no response was received. */
  statusCode: number | null;
  /** Null when the send was refused locally, before any network call. */
  request: WireRequest | null;
  /** The gateway's answer, verbatim: text, or decoded JSON for Unitel. */
  response: unknown;
  error: SmsError | null;
}

/** One operator's gateway, as the client drives it. */
export interface Gateway {
  readonly name: GatewayName;
  /** Longest message the gateway accepts, in characters, when it says. */
  readonly maxLength?: number;
  send(to: string, message: string): Promise<GatewayOutcome>;
}

export type GatewayOutcome = Pick<
  SmsResult,
  "ok" | "statusCode" | "request" | "response" | "error"
>;
