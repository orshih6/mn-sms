# mn-sms

Send SMS through the Mongolian mobile operators' own gateways — **Unitel**, **Mobicom**,
**Skytel** and **G-Mobile** — from one client. You give it a number and a message; it works
out which operator owns the number and calls that operator's gateway.

- Zero dependencies. Node 18+ (uses the built-in `fetch`). ESM and CommonJS, typed.
- Routes by the official number ranges, not by guessing from the first two digits.
- Reads each gateway's real verdict: three of the four answer HTTP `200` for a refused send.
- Never puts a credential in a result, an error message or a log line.

> **This is not an SMS reseller.** There is no shared account behind this package. You need
> your own contract with each operator you want to send through — see
> [What you need from the operators](#what-you-need-from-the-operators).

## Install

```bash
npm install mn-sms
```

## Usage

```ts
import { createSmsClient } from "mn-sms";

const sms = createSmsClient({
  // Configure only the operators you have an account with.
  unitel: { apiKey: process.env.UNITEL_API_KEY! },
  skytel: { id: process.env.SKYTEL_ID!, src: process.env.SKYTEL_SRC! },
  mobicom: {
    baseUrl: process.env.MOBICOM_BASE_URL!,
    serviceName: process.env.MOBICOM_SERVICE_NAME!,
    username: process.env.MOBICOM_USERNAME!,
    from: process.env.MOBICOM_FROM!,
  },
  gmobile: {
    username: process.env.GMOBILE_USERNAME!,
    password: process.env.GMOBILE_PASSWORD!,
    from: process.env.GMOBILE_FROM!,
  },
});

const result = await sms.send({ to: "99112233", message: "Таны код: 1234" });

if (!result.ok) {
  console.error(result.gateway, result.error?.code, result.error?.message);
}
```

Or let it read the environment (variable names are in [.env.example](.env.example)):

```ts
import { configFromEnv, createSmsClient } from "mn-sms";

const sms = createSmsClient(configFromEnv());
```

### `send()` never throws

Every outcome comes back as a result, so success and failure can be logged the same way:

```ts
{
  ok: false,
  to: "91112233",            // normalized to 8 digits
  operator: "skytel",        // who owns the number
  gateway: "skytel",         // which gateway was called
  statusCode: 200,           // yes, 200 — see below
  request: { method, url, params },   // what was sent, WITHOUT credentials
  response: "ERROR: 202 not authenticated",   // the gateway's own words
  error: {
    code: "rejected",
    gatewayCode: "202",
    message: "not authenticated — wrong id, or the calling IP is not on the Allowed IP List",
  },
}
```

| `error.code` | Meaning | Network call made? |
| --- | --- | --- |
| `invalid_number` | Not an 8-digit Mongolian subscriber number. | no |
| `unallocated_number` | 8 digits, but in no operator's range. | no |
| `unsupported_operator` | The number is ONDO's; no gateway for it here. | no |
| `not_configured` | The number's operator has a gateway, but you passed no config for it. | no |
| `empty_message` | — | no |
| `message_too_long` | Over the routed gateway's limit (160 for Skytel and G-Mobile). | no |
| `rejected` | The gateway answered and refused. `gatewayCode` and `response` say why. | yes |
| `timeout` | No answer within `timeoutMs`. ⚠️ **Delivery state is unknown** — the SMS may still arrive. Think before retrying an OTP. | yes |
| `network` | The request never completed (DNS, connection refused, bad base URL). | yes |

`sms.check({ to, message })` runs the "no network call" rows on their own and returns the
error or `null` — useful for validating a form before you spend a send.

### Phone numbers

`to` is the 8-digit subscriber number. `+976`, `976`, `00976`, spaces and dashes are
stripped for you. The helpers are exported if you want them on their own:

```ts
import { gatewayFor, normalizePhone, operatorFor } from "mn-sms";

normalizePhone("+976 9911-2233"); // "99112233"
operatorFor("55501234");          // "mobicom"  (55 0–4 is Unitel, 55 5–9 is Mobicom)
gatewayFor("60112233");           // null       (ONDO — no gateway)
```

### Ported numbers

Mongolia has number portability, and a ported number keeps its original range. Range
routing will send it to the operator it *left*, which refuses it. There is no public
ported-number database to check, so when you know the real operator, say so:

```ts
await sms.send({ to: "99112233", message: "…", operator: "unitel" });
```

### Options

```ts
createSmsClient(config, {
  timeoutMs: 20_000,   // default; the ceiling Skytel documents
  fetch: myFetch,      // inject for tests, or to go through a proxy
});
```

## What you need from the operators

The short version. The full account of each gateway — its wire format, every refusal code,
and what is and is not documented — is in **[docs/operators.md](docs/operators.md)**.

**1. A contract and a sender number, per operator.** Each operator sells its own "special
number" (тусгай дугаар) service to registered organisations. You sign with each one
separately and receive a sender short number plus API access. The sender is fixed to your
account: you cannot choose it per message.

**2. Your server's public IP on each operator's allowlist.** This is the requirement that
catches everyone. All four gateways check the IP the request comes from, and a request from
anywhere else is refused even with correct credentials. In practice:

- You need a **static egress IP**. Serverless platforms and autoscaled clusters that leave
  through changing addresses will not work without a NAT gateway or fixed proxy.
- It will **not work from your laptop** unless that IP is registered too.
- Moving to a new server or cloud means updating four allowlists *before* you cut over.

**3. One operator's gateway only reaches that operator's subscribers.** Skytel documents this
(`ERROR: 206`); plan for it everywhere. To reach every Mongolian mobile number you need all
four accounts, which is exactly what this package's routing is for.

| | Unitel | Skytel | Mobicom | G-Mobile |
| --- | --- | --- | --- | --- |
| Credentials | API key | registration `id` | `username` + `servicename` | `username` + `password` |
| Sender | set in portal | `src` | `from` | `from` |
| IP allowlist | self-service (portal → API key → Hosts) | self-service (portal → Allowed IP List) | ask Mobicom | ask G-Mobile |
| Transport | HTTPS, POST JSON | HTTPS, GET | HTTP, GET | HTTP, GET |
| Accepted answer | HTTP 2xx | body `OK` | body `Sent` | body `0: Accepted for delivery` |
| Refusal | non-2xx | `ERROR: <code> …` under 200 | anything else | `error1`…`error6` under 200 |
| Max length | not documented | 160 chars | not documented | 160 chars |
| Cyrillic | same endpoint | separate endpoint (handled for you) | same endpoint | same endpoint |
| Numbers | 88 89 86 80, 50/55 0–4 | 90 91 96, parts of 69 | 99 95 94 85, 50/55 5–9 | 98 0–1 & 8–9, 93 97 83 0–1, 87 00–11 |

**ONDO** (60, 66, 8181) has number ranges but no gateway in this package. Sends to those
numbers return `unsupported_operator`.

### Things worth knowing before production

- **Mobicom and G-Mobile are plain HTTP.** Your credentials and every message body cross the
  network unencrypted. That is the operators' endpoint, not a choice made here.
- **`ok: true` means the gateway accepted the message, not that the handset received it.**
  None of these send APIs returns a message id or a delivery report.
- **There is no rate limiting or deduplication in this package.** A public OTP endpoint
  needs its own per-number cooldown, or it is an open tap on your SMS bill.
- **Long Cyrillic messages cost more.** A non-Latin SMS holds 70 characters per segment
  against 160 for Latin, and operators bill per segment. Ask your operator how they count.

## Using one gateway directly

Each operator is exported on its own if you do not want routing:

```ts
import { createSkytelGateway, resolveTransport } from "mn-sms";

const skytel = createSkytelGateway({ id, src }, resolveTransport());
await skytel.send("91112233", "hello"); // takes an already-normalized number
```

[docs/gateways.http](docs/gateways.http) has the raw HTTP requests, for probing a gateway
with no code at all.

## Development

```bash
npm install
npm test          # node:test, with a stubbed fetch — nothing is ever sent
npm run typecheck
npm run build     # dist/ — ESM, CJS and type declarations
```

There are no live-gateway tests: a real send costs money, reaches a real subscriber and only
works from an allowlisted IP.

## License

MIT
