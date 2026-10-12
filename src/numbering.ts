import type { GatewayName, Operator } from "./types";

/**
 * Mongolia's mobile allocations as `[first, last, operator]`, from the national
 * ITU-T E.164 numbering plan published by the Communications Regulatory
 * Commission (CRC), communication of 2026-01-28:
 * https://www.itu.int/dms_pub/itu-t/oth/02/02/T020200008E0008PDFE.pdf
 *
 * Ranges rather than leading digits, because the plan is not digit-aligned:
 * 50 and 55 split mid-range between Unitel and Mobicom, Skytel's 69 is three
 * slices, and G-Mobile holds 980–981 but not 982–987. Withdrawn blocks are
 * absent on purpose, so they read as unallocated instead of routing to a
 * carrier that gave them back.
 *
 * To update: re-read the CRC table and edit these rows.
 */
const RANGES: ReadonlyArray<readonly [number, number, Operator]> = [
  [99000000, 99999999, "mobicom"],
  [95000000, 95999999, "mobicom"],
  [94000000, 94999999, "mobicom"],
  [85000000, 85999999, "mobicom"],
  [50500000, 50999999, "mobicom"],
  [55500000, 55999999, "mobicom"],
  [91000000, 91999999, "skytel"],
  [90000000, 90999999, "skytel"],
  [96000000, 96999999, "skytel"],
  [69000000, 69099999, "skytel"],
  [69600000, 69699999, "skytel"],
  [69900000, 69999999, "skytel"],
  [88000000, 88999999, "unitel"],
  [86000000, 86999999, "unitel"],
  [80000000, 80999999, "unitel"],
  [89000000, 89999999, "unitel"],
  [50000000, 50499999, "unitel"],
  [55000000, 55499999, "unitel"],
  [98000000, 98199999, "gmobile"],
  [98800000, 98999999, "gmobile"],
  [93000000, 93199999, "gmobile"],
  [97000000, 97199999, "gmobile"],
  [83000000, 83199999, "gmobile"],
  [87000000, 87099999, "gmobile"],
  [87100000, 87119999, "gmobile"],
  [60000000, 60499999, "ondo"],
  [60500000, 60509999, "ondo"],
  [60600000, 60699999, "ondo"],
  [60700000, 60709999, "ondo"],
  [66000000, 66099999, "ondo"],
  [66100000, 66199999, "ondo"],
  [66600000, 66699999, "ondo"],
  [66900000, 66999999, "ondo"],
  [81810000, 81819999, "ondo"],
];

/** Which gateway carries each operator's traffic. Null: none implemented. */
const GATEWAYS: Readonly<Record<Operator, GatewayName | null>> = {
  unitel: "unitel",
  skytel: "skytel",
  mobicom: "mobicom",
  gmobile: "gmobile",
  ondo: null,
};

/**
 * Reduce a phone number to the 8-digit subscriber number the gateways take.
 * Strips spaces, dashes, dots and parentheses, then a `+976`, `00976` or `976`
 * country prefix. Returns null for anything that is not 8 digits afterwards.
 */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[\s\-().]/g, "").replace(/^(\+|00)976/, "");
  const local =
    digits.length === 11 && digits.startsWith("976") ? digits.slice(3) : digits;
  return /^\d{8}$/.test(local) ? local : null;
}

/** The operator that owns a number by range, or null if no operator does. */
export function operatorFor(phone: string): Operator | null {
  const local = normalizePhone(phone);
  if (!local) return null;
  const msisdn = Number(local);
  return (
    RANGES.find(([first, last]) => msisdn >= first && msisdn <= last)?.[2] ??
    null
  );
}

/**
 * The gateway that can deliver to a number, or null when none can — an
 * operator with no gateway here, or a number in nobody's range.
 *
 * ⚠️ Number portability is not modelled. A ported number keeps its original
 * range, so it routes to the gateway of the operator it left. There is no
 * public ported-number database to consult; pass `operator` to `send()` when
 * you know better.
 */
export function gatewayFor(phone: string): GatewayName | null {
  const operator = operatorFor(phone);
  return operator ? GATEWAYS[operator] : null;
}
