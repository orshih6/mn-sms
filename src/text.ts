/**
 * Message-text helpers: what a message costs in SMS segments, and a Cyrillic
 * to Latin transliteration that keeps it in the cheap encoding. Neither is
 * applied by `send()` — the text you pass is the text that is sent.
 */

/** The GSM 03.38 default alphabet: one septet per character. */
const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";

/** Its extension table: each of these costs an escape plus the character. */
const GSM_EXTENDED = "\f^{}\\[~]|€";

export interface SegmentInfo {
  /**
   * `GSM-7` when every character is in the GSM default alphabet, otherwise
   * `UCS-2` — which one Cyrillic letter, emoji or curly quote is enough for.
   */
  encoding: "GSM-7" | "UCS-2";
  /** Length in the encoding's own units: septets for GSM-7, UTF-16 units for UCS-2. */
  length: number;
  /** How many SMS the handset-side network splits this into. 0 for an empty message. */
  segments: number;
  /** Units one segment holds at this size: 160/70 alone, 153/67 once it is split. */
  perSegment: number;
}

/**
 * How the mobile network will encode and split a message. A single SMS holds
 * 160 GSM-7 characters or 70 UCS-2 ones; a longer message is split into parts
 * of 153 or 67, because each part spends room on a reassembly header.
 *
 * ⚠️ This is the GSM standard's arithmetic, not any gateway's invoice. How an
 * operator counts and bills is its own business, and Skytel and G-Mobile
 * refuse anything over 160 characters before splitting comes into it.
 */
export function countSegments(message: string): SegmentInfo {
  const chars = [...message];
  const gsm = chars.every(
    (ch) => GSM_BASIC.includes(ch) || GSM_EXTENDED.includes(ch),
  );
  const units = chars.map((ch) =>
    gsm ? (GSM_EXTENDED.includes(ch) ? 2 : 1) : ch.length,
  );
  const length = units.reduce((sum, n) => sum + n, 0);
  const [single, multi] = gsm ? [160, 153] : [70, 67];
  const encoding = gsm ? "GSM-7" : "UCS-2";

  if (length <= single)
    return { encoding, length, segments: length ? 1 : 0, perSegment: single };

  // Packed greedily rather than divided, because a two-unit character (a GSM
  // escape pair, a surrogate pair) cannot straddle two parts.
  let segments = 1;
  let used = 0;
  for (const n of units) {
    if (used + n > multi) {
      segments += 1;
      used = 0;
    }
    used += n;
  }
  return { encoding, length, segments, perSegment: multi };
}

/**
 * Mongolian Cyrillic to ASCII, the way it is commonly typed in SMS — not a
 * formal romanization, whose `ö` and `ü` would defeat the purpose.
 */
const CYRILLIC: Readonly<Record<string, string>> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "ye", ё: "yo", ж: "j", з: "z",
  и: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", ө: "u", п: "p",
  р: "r", с: "s", т: "t", у: "u", ү: "u", ф: "f", х: "h", ц: "ts", ч: "ch",
  ш: "sh", щ: "sh", ъ: "", ы: "ii", ь: "i", э: "e", ю: "yu", я: "ya",
};

/**
 * Punctuation a phone or word processor swaps in that is not in the GSM
 * alphabet. One of these alone turns a Latin message into a 70-character one.
 */
const PUNCTUATION: Readonly<Record<string, string>> = {
  "“": '"', "”": '"', "„": '"', "«": '"', "»": '"',
  "‘": "'", "’": "'", "–": "-", "—": "-", "…": "...",
  "№": "No", "₮": "MNT", " ": " ",
};

export interface ToLatinOptions {
  /**
   * Extra or replacement mappings, keyed by a single lowercase character, e.g.
   * `{ ө: "o", ы: "y" }` if you prefer that spelling.
   */
  map?: Readonly<Record<string, string>>;
}

const isUpper = (ch: string | undefined) =>
  ch !== undefined && ch !== ch.toLowerCase();
const isLetter = (ch: string | undefined) =>
  ch !== undefined && ch.toLowerCase() !== ch.toUpperCase();

/**
 * Rewrite Mongolian Cyrillic in Latin letters so the message fits the GSM-7
 * encoding: 160 characters per SMS instead of 70. Anything it has no mapping
 * for passes through unchanged, so check the result with `countSegments()` if
 * the text can hold emoji or other scripts.
 */
export function toLatin(text: string, options: ToLatinOptions = {}): string {
  const map = { ...CYRILLIC, ...PUNCTUATION, ...options.map };
  const chars = [...text];
  return chars
    .map((ch, i) => {
      const latin = map[ch.toLowerCase()];
      if (latin === undefined) return ch;
      if (!isUpper(ch) || latin === "") return latin;
      // "Чат" → "Chat", but "ЧАТ" → "CHAT": a digraph follows its word's case.
      const next = chars[i + 1];
      const shouting =
        isUpper(next) || (!isLetter(next) && isUpper(chars[i - 1]));
      return shouting
        ? latin.toUpperCase()
        : latin.charAt(0).toUpperCase() + latin.slice(1);
    })
    .join("");
}
