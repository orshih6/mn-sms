import assert from "node:assert/strict";
import { test } from "node:test";
import { countSegments, toLatin } from "../src/index";

test("countSegments: Latin is GSM-7, 160 then 153 per part", () => {
  assert.deepEqual(countSegments(""), {
    encoding: "GSM-7",
    length: 0,
    segments: 0,
    perSegment: 160,
  });
  assert.equal(countSegments("x".repeat(160)).segments, 1);
  assert.deepEqual(countSegments("x".repeat(161)), {
    encoding: "GSM-7",
    length: 161,
    segments: 2,
    perSegment: 153,
  });
  assert.equal(countSegments("x".repeat(306)).segments, 2);
  assert.equal(countSegments("x".repeat(307)).segments, 3);
});

test("countSegments: extension characters cost two septets", () => {
  assert.equal(countSegments("[€]").length, 6);
  assert.equal(countSegments("{".repeat(80)).segments, 1);
  assert.equal(countSegments("{".repeat(81)).segments, 2);
  // 76 pairs fill 152 of a part's 153 septets; a pair cannot straddle parts.
  assert.equal(countSegments("{".repeat(153)).segments, 3);
});

test("countSegments: one Cyrillic letter makes it UCS-2, 70 then 67", () => {
  assert.deepEqual(countSegments("Таны код: 1234"), {
    encoding: "UCS-2",
    length: 14,
    segments: 1,
    perSegment: 70,
  });
  assert.equal(countSegments("ө".repeat(70)).segments, 1);
  assert.equal(countSegments("ө".repeat(71)).segments, 2);
  assert.equal(countSegments("ө".repeat(134)).segments, 2);
  assert.equal(countSegments("ө".repeat(135)).segments, 3);
  // A curly quote is enough, and an emoji is two units.
  assert.equal(countSegments("it’s").encoding, "UCS-2");
  assert.equal(countSegments("😀").length, 2);
});

test("toLatin transliterates Mongolian Cyrillic to ASCII", () => {
  assert.equal(
    toLatin("Таны баталгаажуулах код: 1234"),
    "Tanii batalgaajuulah kod: 1234",
  );
  assert.equal(toLatin("Сайн байна уу?"), "Sain baina uu?");
  assert.equal(toLatin("өдөр, үнэ, цэцэг"), "udur, une, tsetseg");
  assert.equal(toLatin("Чат ЧАТ Ч"), "Chat CHAT Ch");
  assert.equal(toLatin("явъя"), "yavya");
  assert.equal(toLatin("already latin 123"), "already latin 123");
});

test("toLatin replaces punctuation that is outside GSM-7", () => {
  const out = toLatin("“Код” – 1234… №5, 500₮");
  assert.equal(out, '"Kod" - 1234... No5, 500MNT');
  assert.equal(countSegments(out).encoding, "GSM-7");
});

test("toLatin: the result of a Cyrillic message fits one GSM-7 segment", () => {
  const cyrillic = "Таны захиалга баталгаажлаа. Хүргэлт маргааш 14 цагт очно. Баярлалаа!";
  assert.equal(countSegments(cyrillic).encoding, "UCS-2");
  const latin = countSegments(toLatin(cyrillic));
  assert.equal(latin.encoding, "GSM-7");
  assert.equal(latin.segments, 1);
});

test("toLatin accepts a custom map", () => {
  assert.equal(toLatin("өдөр таны", { map: { ө: "o", ы: "y" } }), "odor tany");
});
