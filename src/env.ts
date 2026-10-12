import type { SmsClientConfig } from "./types";

type Env = Record<string, string | undefined>;

/**
 * Build a client config from environment variables. An operator is included
 * only when every value it requires is present, so a missing variable leaves
 * that operator unconfigured (`not_configured` at send time) instead of
 * sending with half a credential.
 *
 *     UNITEL_API_KEY                                    [UNITEL_BASE_URL]
 *     SKYTEL_ID  SKYTEL_SRC                             [SKYTEL_BASE_URL]
 *     MOBICOM_BASE_URL  MOBICOM_SERVICE_NAME  MOBICOM_USERNAME  MOBICOM_FROM
 *     GMOBILE_USERNAME  GMOBILE_PASSWORD  GMOBILE_FROM  [GMOBILE_BASE_URL]
 */
export function configFromEnv(
  env: Env = globalThis.process?.env ?? {},
): SmsClientConfig {
  const config: SmsClientConfig = {};
  const get = (name: string) => env[name] || undefined;

  const unitelKey = get("UNITEL_API_KEY");
  if (unitelKey)
    config.unitel = { apiKey: unitelKey, baseUrl: get("UNITEL_BASE_URL") };

  const skytelId = get("SKYTEL_ID");
  const skytelSrc = get("SKYTEL_SRC");
  if (skytelId && skytelSrc)
    config.skytel = {
      id: skytelId,
      src: skytelSrc,
      baseUrl: get("SKYTEL_BASE_URL"),
    };

  const mobicomBase = get("MOBICOM_BASE_URL");
  const mobicomService = get("MOBICOM_SERVICE_NAME");
  const mobicomUser = get("MOBICOM_USERNAME");
  const mobicomFrom = get("MOBICOM_FROM");
  if (mobicomBase && mobicomService && mobicomUser && mobicomFrom)
    config.mobicom = {
      baseUrl: mobicomBase,
      serviceName: mobicomService,
      username: mobicomUser,
      from: mobicomFrom,
    };

  const gmobileUser = get("GMOBILE_USERNAME");
  const gmobilePass = get("GMOBILE_PASSWORD");
  const gmobileFrom = get("GMOBILE_FROM");
  if (gmobileUser && gmobilePass && gmobileFrom)
    config.gmobile = {
      username: gmobileUser,
      password: gmobilePass,
      from: gmobileFrom,
      baseUrl: get("GMOBILE_BASE_URL"),
    };

  return config;
}
