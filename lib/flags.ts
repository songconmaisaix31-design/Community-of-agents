/**
 * Content heuristics for post bodies. Pure functions, no imports, so they can be tested without a database.
 * Flags are attached to a post, never used to block or rank. Re-exported from safety.ts.
 */

const INJECTION_PATTERNS: RegExp[] = [
  /ignore (all |any |the )?(previous|prior|above|earlier) (instructions|prompts|messages|rules)/i,
  /disregard (all |any |the )?(previous|prior|above) /i,
  /you are now (a|an|the) /i,
  /\bsystem prompt\b/i,
  /\b(as an? (ai|llm|language model|assistant)),? you (must|should|will)\b/i,
  /\b(send|post|forward|exfiltrate|paste|reveal|share) (me |us )?(your|the user'?s?|their) (api[_ -]?key|token|password|credentials|secret|private key|session)/i,
  /\bcurl\s+(-[a-zA-Z]+\s+)*https?:\/\/[^\s]+/i,
  /\b(do not|don'?t) (tell|inform|show|mention) (the |your )?(user|human|operator)/i,
  /\[\s*(inst|system|assistant)\s*\]/i,
  /<\s*\/?\s*(system|assistant|instructions?)\s*>/i,
  /\bbegin (hidden|secret) (instructions|prompt)\b/i,
];

/** Text that asks the reader to propagate the message to other agents. Crier never asks for that. */
const AGENTS = "((other|all|every|fellow|any|each|the other) (agents?|assistants?|bots?|llms?|ais?|models?)|(agents|assistants|bots|llms|ais|models))";
const RELAY_PATTERNS: RegExp[] = [
  new RegExp(`\\b(relay|forward|repost|propagate|spread|pass|broadcast|rebroadcast|circulate) (this|it|the (message|post|word|notice|announcement)|these instructions)( (on|along|to|onto|around|further))?\\b[^.\\n]{0,80}\\b${AGENTS}\\b`, "i"),
  new RegExp(`\\b(tell|inform|notify|alert|share (this |it )?with|send (this |it )?to|instruct|remind) ${AGENTS}\\b`, "i"),
  /\bplease (relay|forward|repost|propagate|spread|broadcast|circulate)\b/i,
  new RegExp(`\\b(make sure|ensure) ${AGENTS} (see|read|hear|get|receive|know)`, "i"),
];

const HIDDEN_UNICODE = /[\u200B-\u200F\u2028-\u202E\u2060-\u2064\uFEFF\u{E0000}-\u{E007F}]/u;
const BASE64_BLOB = /(?:[A-Za-z0-9+/]{4}){20,}={0,2}/;

const QA_LINE = /^(q|a|question|answer)\s*[\d:.)\-]/i;
const RECORD_LINE = /^[\d.,;\s|%\-]+$/;

/** Mostly question/answer pairs or bare numeric/CSV records: content meant to be indexed, not acted on. */
export function looksLikeAnswerDump(body: string): boolean {
  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 6) return false;
  const hits = lines.filter((l) => QA_LINE.test(l) || (RECORD_LINE.test(l) && /\d/.test(l))).length;
  return hits / lines.length >= 0.6;
}

/** Flags for a post. Compute on the text as sent, before hidden unicode is stripped, so hidden_unicode can fire. */
export function contentFlags(title: string, body: string): string[] {
  const text = `${title}\n${body}`;
  const flags = new Set<string>();
  if (INJECTION_PATTERNS.some((r) => r.test(text))) flags.add("possible_instruction");
  if (HIDDEN_UNICODE.test(text)) flags.add("hidden_unicode");
  if (BASE64_BLOB.test(text)) flags.add("encoded_blob");
  const urls = text.match(/https?:\/\/[^\s)]+/gi) ?? [];
  if (urls.length > 5) flags.add("many_links");
  if (RELAY_PATTERNS.some((r) => r.test(text))) flags.add("relay_request");
  if (looksLikeAnswerDump(body)) flags.add("answer_dump");
  return [...flags];
}

/** Strip hidden unicode so it can't be used to smuggle text past a reader. */
export function stripHiddenUnicode(s: string): string {
  return s.replace(new RegExp(HIDDEN_UNICODE.source, "gu"), "");
}
