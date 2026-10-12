export { createSmsClient, type SmsClient } from "./client";
export { configFromEnv } from "./env";
export { gatewayFor, normalizePhone, operatorFor } from "./numbering";
export { createGmobileGateway, GMOBILE_ERRORS } from "./operators/gmobile";
export { createMobicomGateway } from "./operators/mobicom";
export { createSkytelGateway, SKYTEL_ERRORS } from "./operators/skytel";
export { createUnitelGateway } from "./operators/unitel";
export {
  countSegments,
  type SegmentInfo,
  type ToLatinOptions,
  toLatin,
} from "./text";
export { DEFAULT_TIMEOUT_MS, resolveTransport } from "./transport";
export type {
  Gateway,
  GatewayName,
  GatewayOutcome,
  GmobileConfig,
  MobicomConfig,
  Operator,
  SendInput,
  SkytelConfig,
  SmsClientConfig,
  SmsClientOptions,
  SmsError,
  SmsErrorCode,
  SmsResult,
  UnitelConfig,
  WireRequest,
} from "./types";
