# The operators

**English** · [Монгол](operators.mn.md)

What each Mongolian operator requires before you can send an SMS through its gateway, and
exactly how each gateway behaves on the wire.

It covers all four gateways. Where something comes from an operator's own manual it says
so; where something is not documented or still unconfirmed, it says that too.
The operators' manuals themselves are not redistributed here — you receive them with your
account.

- [What is the same everywhere](#what-is-the-same-everywhere)
- [Getting an account](#getting-an-account)
- [Unitel](#unitel)
- [Skytel](#skytel)
- [Mobicom](#mobicom)
- [G-Mobile](#g-mobile)
- [ONDO](#ondo)
- [Number ranges](#number-ranges)
- [Deployment checklist](#deployment-checklist)

## What is the same everywhere

**You need your own account with each operator.** There is no aggregator underneath this
package. Each operator sells a "special number" service (тусгай дугаар — also called a
premium or short number) to registered organisations, and the API comes with it.

**The sender is your short number, fixed per account.** You never choose it per message.
Skytel rejects any other value outright (`ERROR: 207`); G-Mobile answers `error2`.

**Authentication includes the calling IP.** Every gateway checks the source address of the
request against a list registered for your account. Correct credentials from an
unregistered IP are refused:

| Operator | What an unregistered IP gets | How the list is managed |
| --- | --- | --- |
| Unitel | refused | yourself, in the portal: Settings → API key → Hosts |
| Skytel | `ERROR: 202 not authenticated` | yourself, in the portal: Change configurations → Allowed IP List |
| Mobicom | refused | by Mobicom, on request |
| G-Mobile | `error3` | by G-Mobile, on request |

So you need a **static public egress IP**, and you need to register it four times. Things
that break this: serverless functions, autoscaled nodes with ephemeral addresses, a
Kubernetes cluster whose pods leave through whichever node they landed on, a developer
laptop. Put a NAT gateway or a fixed forward proxy in front and register that address. The
client's `fetch` option exists partly for this.

**Each gateway delivers only to its own network.** Skytel's manual states it — `dest` "must
be a Skytel number" — and enforces it with `ERROR: 206`. The other three manuals do not
state the rule, so assume it holds for them too unless the operator tells you otherwise.
Treat a send to the wrong operator as a lost message, not a slow one. This is the whole
reason the package routes by number.

**The HTTP status is not the verdict.** Skytel, Mobicom and G-Mobile are plain-text gateways
that answer `200 OK` whether they accepted the message or refused it. The body is what
matters. A client that checks only `response.ok` will record every refused send as
delivered. This package whitelists each gateway's acceptance line and treats *everything
else* — a documented error, a proxy's HTML page, an empty body — as a refusal.

**Acceptance is not delivery.** None of these send APIs returns a message id, and none
pushes a delivery report. "Accepted" means the gateway took the message. What the handset
did with it is visible only in each operator's web portal.

**Numbers are 8 digits.** The gateways take the bare subscriber number, with no `976`.

## Getting an account

The process differs in detail per operator and changes over time, so confirm with each
operator's corporate sales desk. What to expect in general:

1. A service contract between your registered organisation and the operator.
2. A short sender number assigned to you. It is common — not guaranteed — to get the *same*
   short number from several operators, which lets one configured sender work everywhere.
3. An account letter or portal login carrying your API credentials and the gateway address.
4. Your server IPs registered (see above).
5. Monthly invoicing for what you sent. Unitel's manual, for example, issues the invoice on
   the 7th for the previous month, due before the 21st, and suspends the number if it goes
   unpaid.

Budget calendar time for this. The integration is an afternoon; the paperwork is not.

## Unitel

Portal: `https://pn.unitel.mn`. Source: Unitel's PN user manual.

**What you need**

- A portal login for your organisation.
- An API key, created under **Settings → API key**. When creating it:
  - **Premium number** — which of your special numbers this key sends from.
  - **Hosts** — your server IP addresses. The manual is explicit that without this, sending
    from your address is not possible.
  - **Password** — set once and never shown again. So is the generated key. Save both.
  - **Regexes** — optional; masks parts of a message in the portal's logs.
- Optionally a sender *name* instead of the number: **Settings → Premium Number → Name**
  (11 characters at most) with **Uses name** turned on. Recipients then see the name.

**Config**

```ts
unitel: { apiKey: "…" }   // baseUrl defaults to https://pn.unitel.mn
```

**Wire**

```
POST https://pn.unitel.mn/api/message/send/sms?enc=<API_KEY>
content-type: application/json

{"to":"88112233","message":"…"}
```

The manual also documents a query-string form (`/api/message/send/sms/q?enc=…&to=…&message=…`,
GET or POST). This package uses the JSON body because Cyrillic passes through it untouched.

**Response.** The response body is **not documented** in the manual. This package therefore
goes by HTTP status — 2xx is accepted, anything else is `rejected` with the status as
`gatewayCode` — and returns the body verbatim in `result.response` (parsed if it is JSON).
Log it; it is your only evidence when something goes wrong.

**Limits.** No message-length limit is documented, so none is enforced here.

**Receiving replies.** Unitel can forward subscriber replies to a URL of yours. Under
**Settings → Premium Number**, turn on **Uses receiver** and fill in **Edit receiver**: the
method (GET or POST), your full URL, and the *names* you want for four parameters — the
subscriber's number, your premium number, the message and the date. You choose those names,
so your endpoint and the portal must agree. The receiver has no shared secret or signature;
anyone who finds the URL can post to it, so restrict it at the network level. The date
format is undocumented — store it as a string. This package does not include a receiver;
it is one small route in whatever HTTP framework you already use.

## Skytel

Portal: `https://smsgw.skytel.mn`. Source: Skytel's PushSMS interface guide, the most
complete of the four.

**What you need**

- A registration number (`id`, "бүртгэлийн дугаар") and a sender short number (`src`), both
  in the account letter.
- A portal login. It arrives with a default password — change it on first login.
- Your IPs under **Change configurations → Allowed IP List**, separated by semicolons. You
  can add and remove them yourself, any number of them.

`id` behaves as a password even though it is called a registration number: together with
your IP it is the entire credential. Keep it out of logs and source control.

**Config**

```ts
skytel: { id: "…", src: "…" }   // baseUrl defaults to https://smsgw.skytel.mn
```

**Wire**

```
GET https://smsgw.skytel.mn/SMSGW-war/pushsms?id=<ID>&src=<SRC>&dest=91112233&text=hello
GET https://smsgw.skytel.mn/SMSGW-war/unicode?id=<ID>&src=<SRC>&dest=91112233&text=<Cyrillic>
```

**Two endpoints, by alphabet.** `/pushsms` carries Latin text. Anything else must go to
`/unicode`, or the subscriber receives garbage. This package looks at the message and picks:
pure ASCII goes to `/pushsms`, everything else to `/unicode`. You do not need to do anything.

**Response.** Plain text under HTTP 200.

| Body | Meaning |
| --- | --- |
| `OK` | Accepted. |
| `ERROR: 101 …` | A required parameter is missing. |
| `ERROR: 102 …` | Invalid `src` (sender) number. |
| `ERROR: 103 …` | Invalid `dest` (recipient) number. |
| `ERROR: 201 …` | Invalid parameter(s). |
| `ERROR: 202 not authenticated` | Wrong `id` **or** an unregistered IP — the answer does not say which. Check the allowlist first. |
| `ERROR: 203 account disabled` | The account is closed. |
| `ERROR: 206 …` | The recipient is on another network. This account may only send to Skytel numbers. |
| `ERROR: 207 …` | `src` is not the sender registered to this account. |

The number lands in `error.gatewayCode`; the table is exported as `SKYTEL_ERRORS`.

**Limits.** `text` is at most **160 characters**. The gateway does not split a longer
message. This package refuses one before calling (`message_too_long`).

**Timeout.** The manual says the server answers within 20 seconds, and that past 20 seconds
you should assume a network break with the *delivery state undefined*. That is where this
package's default `timeoutMs` comes from, and why a timeout is reported as its own
`timeout` code rather than as a failure. Retrying may deliver a second copy.

**Receiving replies.** No webhook. Inbound messages are read in the portal.

## Mobicom

Source: the account letter. **Mobicom's gateway is the least documented of the four**, and
this section says plainly what is not confirmed.

**What you need**, all from the account letter:

- The gateway address. It can be a bare IP address over plain HTTP rather than a hostname.
  This package has **no default** for it — pass what your letter says as `baseUrl`.
- `servicename` — the identifier of the service your account sends under.
- `username` — the account name.
- `from` — your sender short number.
- Your server IP registered with Mobicom. This is done by Mobicom, not in a portal.

There is **no password**. The username plus the source IP is the whole credential, which
makes the IP allowlist the only real secret. Treat the username as sensitive anyway.

**Config**

```ts
mobicom: {
  baseUrl: "http://<gateway address from your letter>",
  serviceName: "…",
  username: "…",
  from: "…",
}
```

**Wire**

```
GET <baseUrl>/smsmt/mt?servicename=<SERVICE>&username=<USERNAME>&from=<FROM>&to=99112233&msg=hello
```

One endpoint for both alphabets; Cyrillic is sent UTF-8 percent-encoded.

**No TLS.** The username and every message body travel in clear text. If that is not
acceptable for what you send, raise it with Mobicom — a VPN or leased line to the operator
is the usual answer — because nothing on the client side can fix it.

**Response.** Plain text.

- `Sent` — accepted.
- Anything else — treated as refused, with the body returned verbatim.

⚠️ **Unconfirmed.** The `Sent` token does not come from Mobicom documentation, and this
package has no list of Mobicom's refusal messages. It therefore whitelists `Sent` and
refuses to guess about the rest. If you see a `rejected` result whose `response` looks like
a success in other words, please open an issue with the exact body.

**Limits.** No length limit or timeout is documented. No length limit is enforced; the
20-second timeout is borrowed from Skytel so a hung gateway cannot hold a request open.

## G-Mobile

Source: G-Mobile's one-page API guide for special-number holders.

**What you need**

- `username` and `password`.
- `from` — your special number.
- Your server IP registered with G-Mobile. Done by G-Mobile, on request.

This is the only one of the four with a real password.

**Config**

```ts
gmobile: { username: "…", password: "…", from: "…" }
// baseUrl defaults to http://sms-special.gmobile.mn
```

**Wire**

```
GET http://sms-special.gmobile.mn/cgi-bin/sendsms?username=<U>&password=<P>&from=<FROM>&to=98112233&text=hello
```

One endpoint for both alphabets; Cyrillic is sent UTF-8 percent-encoded. The one-page guide
lists only `from`, `to` and `text` as parameters; `username` and `password` come with the
account.

**No TLS.** Both halves of the credential, and every message, cross the wire in clear text.
The same caveat as Mobicom applies.

**Response.** Plain text under HTTP 200.

| Body | Meaning |
| --- | --- |
| `0: Accepted for delivery` | Accepted. |
| `error1` | A required parameter was not sent. |
| `error2` | The special (sender) number does not exist. |
| `error3` | The request came from an IP address that is not allowed. |
| `error4` | This account's right to send has been closed. |
| `error5` | The recipient's number is invalid. |
| `error6` | The text is longer than 160 characters. |

The token lands in `error.gatewayCode` and its meaning in `error.message`; the table is
exported as `GMOBILE_ERRORS`.

The URL path and the acceptance line are those of [Kannel](https://www.kannel.org/), the
open-source SMS gateway. Kannel can also answer `3: Queued for later delivery` when its
link to the SMS centre is down. G-Mobile's guide does not list that answer, so this package
reports it as `rejected` rather than assume the message will go out. If you see it, the
message *may* be delivered later — do not blindly resend an OTP.

**Limits.** **160 characters**, enforced before the call (`message_too_long`), so you should
never actually receive `error6`.

## ONDO

ONDO holds number ranges (60, 66 and 8181 blocks) but there is no gateway for it in this
package. A send to an ONDO number returns `unsupported_operator` without a network call.
If you have integrated ONDO's API, a pull request is welcome: it is one file under
`src/operators/` and one line in the routing table.

## Number ranges

Routing uses the mobile allocations in Mongolia's national numbering plan, as filed by the
Communications Regulatory Commission with the ITU (communication of 2026-01-28):
<https://www.itu.int/dms_pub/itu-t/oth/02/02/T020200008E0008PDFE.pdf>

| Operator | Ranges |
| --- | --- |
| Mobicom | 99, 95, 94, 85 · 505–509 · 555–559 |
| Unitel | 88, 89, 86, 80 · 500–504 · 550–554 |
| Skytel | 91, 90, 96 · 690, 696, 699 |
| G-Mobile | 980–981, 988–989 · 930–931 · 970–971 · 830–831 · 8700–8711 |
| ONDO | 600–604, 6050, 606, 6070 · 660, 661, 666, 669 · 8181 |

Three things about this table:

- **It is ranges, not prefixes.** `50` and `55` are split down the middle between Unitel and
  Mobicom. Skytel's `69` is three separate slices. G-Mobile has `980–981` and `988–989` but
  not `982–987`. A lookup on the first two digits gets these wrong.
- **Withdrawn blocks are left out on purpose.** A block an operator returned to the
  regulator reads as `unallocated_number`, instead of routing to the operator that used to
  hold it.
- **It goes stale.** Allocations change. The table ships inside the package, so you get an
  update by upgrading. If a valid number comes back `unallocated_number`, check the current
  plan and open an issue.

**Portability is not modelled.** A subscriber who ports to another operator keeps their
number, and so their range. Range routing sends them to the gateway of the operator they
left, which refuses the message. There is no public database of ported numbers. If you
learn the real operator some other way, pass `operator` to `send()`.

## Deployment checklist

- [ ] A contract and sender number with each operator you need.
- [ ] A static egress IP for production, registered with **every** operator.
- [ ] The same for staging, if staging sends real messages.
- [ ] Credentials in a secret store. Skytel's `id` and Mobicom's `username` are credentials
      even though they are not named like passwords.
- [ ] A test send to a SIM you hold on **each** network. A Unitel success tells you nothing
      about Mobicom.
- [ ] Every `result` logged — `request` and `response` are already free of credentials.
      It is your audit trail when an invoice is disputed.
- [ ] A per-recipient cooldown and a daily ceiling in front of anything public, especially
      an OTP endpoint. The package enforces neither.
- [ ] A decision about `timeout`: for an OTP, issuing a *new* code is safer than resending
      the same one.
- [ ] Before any infrastructure move: new IPs on all four allowlists **first**.
