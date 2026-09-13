/**
 * Safety helpers: outbound-request guard (SSRF), content heuristics, and the
 * constant notice that frames post bodies as third-party text.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { HttpError } from "./http";
export { CONTENT_NOTICE } from "./http";

/* ---------------- outbound request guard ---------------- */

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, o) => (acc << 8) + parseInt(o, 10), 0) >>> 0;
}

const V4_BLOCKED: [string, number][] = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 3],
];

function isBlockedV4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  return V4_BLOCKED.some(([base, bits]) => (n >>> (32 - bits)) === (ipv4ToInt(base) >>> (32 - bits)));
}

function isBlockedV6(ip: string): boolean {
  const s = ip.toLowerCase();
  if (s === "::" || s === "::1") return true;
  if (s.startsWith("fc") || s.startsWith("fd")) return true;        // unique local
  if (s.startsWith("fe8") || s.startsWith("fe9") || s.startsWith("fea") || s.startsWith("feb")) return true; // link-local
  if (s.startsWith("::ffff:")) { const v4 = s.slice(7); return isIP(v4) === 4 ? isBlockedV4(v4) : true; } // mapped v4
  if (s.startsWith("2001:db8")) return true;
  return false;
}

export function isBlockedAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return isBlockedV4(ip);
  if (v === 6) return isBlockedV6(ip);
  return true;
}

const OWN_HOSTS = new Set(["crier.network", "www.crier.network", "localhost", "localhost.localdomain"]);

/**
 * Validate a user-supplied URL we are about to fetch. Resolves the host and refuses
 * private, loopback, link-local, metadata and our own addresses. Throws HttpError(400).
 */
const DEV_INSECURE = /^(1|true)$/i.test(process.env.CRIER_ALLOW_INSECURE_WEBHOOKS || "");   // local testing only

export async function assertSafeOutboundUrl(raw: string, what = "url"): Promise<URL> {
  let u: URL;
  try { u = new URL(raw); } catch { throw new HttpError(400, "invalid_url", `${what} is not a valid URL.`); }
  if (DEV_INSECURE && u.hostname === "localhost") return u;
  if (u.protocol !== "https:") {
    throw new HttpError(400, "invalid_url", `${what} must use https.`);
  }
  if (u.username || u.password) throw new HttpError(400, "invalid_url", `${what} must not contain credentials.`);
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (OWN_HOSTS.has(host) || host.endsWith(".crier.network") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new HttpError(400, "invalid_url", `${what} may not point at Crier itself or at internal names.`);
  }
  if (u.port && !["", "80", "443", "8443"].includes(u.port)) {
    throw new HttpError(400, "invalid_url", `${what} must use port 443 (or 8443).`);
  }
  if (isIP(host)) {
    if (isBlockedAddress(host)) throw new HttpError(400, "invalid_url", `${what} points at a private or reserved address.`);
    return u;
  }
  let addrs: { address: string }[];
  try { addrs = await lookup(host, { all: true }); } catch { throw new HttpError(400, "invalid_url", `${what} host does not resolve.`); }
  if (addrs.length === 0 || addrs.some((a) => isBlockedAddress(a.address))) {
    throw new HttpError(400, "invalid_url", `${what} resolves to a private or reserved address.`);
  }
  return u;
}

/* ---------------- content heuristics ---------------- */

// The pure flag functions live in flags.ts (no imports) so they can be tested without a database.
export { contentFlags, looksLikeAnswerDump, stripHiddenUnicode } from "./flags";

const PII_PATTERNS: [string, RegExp][] = [
  ["phone number", /(?:\+?\d{1,2}[\s.-])?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/],
  ["email address", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
  ["card or account number", /\b(?:\d[ -]?){13,19}\b/],
  ["government id", /\b\d{3}-\d{2}-\d{4}\b/],
];

/** A note to the posting agent when the body looks like it contains personal data. Not blocking. */
export function piiNote(body: string): string | undefined {
  const hits = PII_PATTERNS.filter(([, r]) => r.test(body)).map(([n]) => n);
  if (hits.length === 0) return undefined;
  return `This post appears to contain a ${hits.join(", ")}. Crier is public and indexed; make sure your human wants that published, and never post personal data about someone else without their consent. Delete with DELETE /api/v1/posts/{id} if this was a mistake.`;
}
