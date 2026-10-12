import assert from "node:assert/strict";
import { test } from "node:test";
import {
  configFromEnv,
  createSmsClient,
  gatewayFor,
  normalizePhone,
  operatorFor,
  type SmsClientConfig,
} from "../src/index";

const config: SmsClientConfig = {
  unitel: { apiKey: "UNITEL-KEY" },
  skytel: { id: "SKYTEL-ID", src: "140000" },
  mobicom: {
    baseUrl: "http://mobicom.test/",
    serviceName: "svc",
    username: "MOBI-USER",
    from: "140000",
  },
  gmobile: { username: "G-USER", password: "G-PASS", from: "140000" },
};

interface Call {
  url: string;
  init: RequestInit | undefined;
}

/** A fetch that records each call and answers from a queue. */
function stub(...answers: Array<[number, string] | Error>) {
  const calls: Call[] = [];
  const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const answer = answers.shift();
    if (!answer) throw new Error("unexpected fetch");
    if (answer instanceof Error) throw answer;
    return new Response(answer[1], { status: answer[0] });
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

test("normalizePhone strips country prefixes and separators", () => {
  assert.equal(normalizePhone("99112233"), "99112233");
  assert.equal(normalizePhone("+976 9911-2233"), "99112233");
  assert.equal(normalizePhone("97699112233"), "99112233");
  assert.equal(normalizePhone("0097699112233"), "99112233");
  assert.equal(normalizePhone("9911223"), null);
  assert.equal(normalizePhone("9911223a"), null);
});

test("operatorFor follows ranges, not leading digits", () => {
  assert.equal(operatorFor("99112233"), "mobicom");
  assert.equal(operatorFor("88112233"), "unitel");
  assert.equal(operatorFor("91112233"), "skytel");
  assert.equal(operatorFor("98112233"), "gmobile");
  // 50 and 55 split mid-range between Unitel and Mobicom.
  assert.equal(operatorFor("50499999"), "unitel");
  assert.equal(operatorFor("50500000"), "mobicom");
  assert.equal(operatorFor("55499999"), "unitel");
  assert.equal(operatorFor("55500000"), "mobicom");
  // G-Mobile holds 980–981 and 988–989, not what lies between.
  assert.equal(operatorFor("98200000"), null);
  assert.equal(operatorFor("98800000"), "gmobile");
  assert.equal(operatorFor("60112233"), "ondo");
  assert.equal(gatewayFor("60112233"), null);
  assert.equal(operatorFor("11112233"), null);
});

test("refuses locally, before any network call", async () => {
  const { fetch, calls } = stub();
  const sms = createSmsClient({ skytel: config.skytel }, { fetch });

  const cases: Array<[string, string, string]> = [
    ["123", "hi", "invalid_number"],
    ["11112233", "hi", "unallocated_number"],
    ["60112233", "hi", "unsupported_operator"],
    ["99112233", "hi", "not_configured"],
    ["91112233", "", "empty_message"],
    ["91112233", "x".repeat(161), "message_too_long"],
  ];
  for (const [to, message, code] of cases) {
    const result = await sms.send({ to, message });
    assert.equal(result.ok, false);
    assert.equal(result.error?.code, code);
    assert.equal(result.request, null);
    assert.equal(sms.check({ to, message })?.code, code);
  }
  assert.equal(calls.length, 0);
  assert.equal(sms.check({ to: "91112233", message: "hi" }), null);
});

test("unitel: POSTs JSON with the key in `enc`, status is the verdict", async () => {
  const { fetch, calls } = stub([200, '{"result":"ok"}'], [403, "denied"]);
  const sms = createSmsClient(config, { fetch });

  const sent = await sms.send({ to: "+976 88112233", message: "Сайн уу" });
  assert.equal(sent.ok, true);
  assert.equal(sent.to, "88112233");
  assert.equal(sent.gateway, "unitel");
  assert.deepEqual(sent.response, { result: "ok" });
  const call = calls[0];
  assert.equal(
    call?.url,
    "https://pn.unitel.mn/api/message/send/sms?enc=UNITEL-KEY",
  );
  assert.equal(call?.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(call?.init?.body)), {
    to: "88112233",
    message: "Сайн уу",
  });

  const refused = await sms.send({ to: "88112233", message: "hi" });
  assert.equal(refused.ok, false);
  assert.equal(refused.error?.code, "rejected");
  assert.equal(refused.statusCode, 403);
  assert.equal(refused.response, "denied");
});

test("skytel: picks the endpoint from the alphabet and reads the body", async () => {
  const { fetch, calls } = stub(
    [200, "OK"],
    [200, "OK\n"],
    [200, "ERROR: 202 not authenticated"],
  );
  const sms = createSmsClient(config, { fetch });

  assert.equal((await sms.send({ to: "91112233", message: "a b" })).ok, true);
  assert.equal(
    calls[0]?.url,
    "https://smsgw.skytel.mn/SMSGW-war/pushsms?id=SKYTEL-ID&src=140000&dest=91112233&text=a%20b",
  );

  assert.equal((await sms.send({ to: "91112233", message: "код" })).ok, true);
  assert.match(calls[1]?.url ?? "", /\/SMSGW-war\/unicode\?/);

  // A refusal arrives under HTTP 200.
  const refused = await sms.send({ to: "91112233", message: "hi" });
  assert.equal(refused.ok, false);
  assert.equal(refused.statusCode, 200);
  assert.equal(refused.error?.code, "rejected");
  assert.equal(refused.error?.gatewayCode, "202");
  assert.equal(refused.response, "ERROR: 202 not authenticated");
});

test("mobicom: only the word `Sent` is an acceptance", async () => {
  const { fetch, calls } = stub([200, "Sent"], [200, "<html>proxy</html>"]);
  const sms = createSmsClient(config, { fetch });

  assert.equal((await sms.send({ to: "99112233", message: "a b" })).ok, true);
  assert.equal(
    calls[0]?.url,
    "http://mobicom.test/smsmt/mt?servicename=svc&username=MOBI-USER&from=140000&to=99112233&msg=a%20b",
  );

  const refused = await sms.send({ to: "99112233", message: "hi" });
  assert.equal(refused.ok, false);
  assert.equal(refused.error?.code, "rejected");
});

test("gmobile: reads the Kannel line and explains errorN", async () => {
  const { fetch, calls } = stub(
    [200, "0: Accepted for delivery"],
    [200, "error3"],
    [200, "3: Queued for later delivery"],
  );
  const sms = createSmsClient(config, { fetch });

  assert.equal((await sms.send({ to: "98112233", message: "a b" })).ok, true);
  assert.equal(
    calls[0]?.url,
    "http://sms-special.gmobile.mn/cgi-bin/sendsms?username=G-USER&password=G-PASS&from=140000&to=98112233&text=a%20b",
  );

  const refused = await sms.send({ to: "98112233", message: "hi" });
  assert.equal(refused.error?.gatewayCode, "error3");
  assert.match(refused.error?.message ?? "", /IP address/);

  const queued = await sms.send({ to: "98112233", message: "hi" });
  assert.equal(queued.ok, false);
  assert.equal(queued.error?.code, "rejected");
});

test("credentials never appear in a result", async () => {
  const leaky = (secret: string) =>
    new Error(`connect ECONNREFUSED while fetching ...${secret}...`);
  const { fetch } = stub(
    [200, "{}"],
    [200, "OK"],
    [200, "Sent"],
    [200, "0: Accepted for delivery"],
    leaky("UNITEL-KEY"),
    leaky("SKYTEL-ID"),
    leaky("MOBI-USER"),
    leaky("G-PASS"),
  );
  const sms = createSmsClient(config, { fetch });
  const numbers = ["88112233", "91112233", "99112233", "98112233"];

  for (const round of ["accepted", "network"]) {
    for (const to of numbers) {
      const result = await sms.send({ to, message: "hi" });
      if (round === "network") assert.equal(result.error?.code, "network");
      const dump = JSON.stringify(result);
      for (const secret of [
        "UNITEL-KEY",
        "SKYTEL-ID",
        "MOBI-USER",
        "G-USER",
        "G-PASS",
      ])
        assert.ok(!dump.includes(secret), `${secret} leaked for ${to}`);
    }
  }
});

test("a timeout is reported as unknown, not failed", async () => {
  const timeout = new Error("The operation was aborted due to timeout");
  timeout.name = "TimeoutError";
  const { fetch } = stub(timeout);
  const sms = createSmsClient(config, { fetch, timeoutMs: 5 });

  const result = await sms.send({ to: "91112233", message: "hi" });
  assert.equal(result.ok, false);
  assert.equal(result.error?.code, "timeout");
  assert.match(result.error?.message ?? "", /delivery state is unknown/);
});

test("`operator` overrides range routing for a ported number", async () => {
  const { fetch, calls } = stub([200, "OK"]);
  const sms = createSmsClient(config, { fetch });

  const result = await sms.send({
    to: "99112233",
    message: "hi",
    operator: "skytel",
  });
  assert.equal(result.ok, true);
  assert.equal(result.operator, "mobicom");
  assert.equal(result.gateway, "skytel");
  assert.match(calls[0]?.url ?? "", /smsgw\.skytel\.mn/);
});

test("configFromEnv includes only fully configured operators", () => {
  const fromEnv = configFromEnv({
    UNITEL_API_KEY: "k",
    SKYTEL_ID: "id",
    GMOBILE_USERNAME: "u",
    GMOBILE_PASSWORD: "",
    GMOBILE_FROM: "140000",
  });
  assert.deepEqual(Object.keys(fromEnv), ["unitel"]);
  assert.deepEqual(createSmsClient(fromEnv).gateways, ["unitel"]);
});
