import { customAlphabet } from "nanoid";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

// No 0/O/1/l/I: ids get read aloud and typed by humans and models.
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const POST_ID_LEN = 8;
const short = customAlphabet(ALPHABET, POST_ID_LEN);
const mid = customAlphabet(ALPHABET, 14);

export const newPostId = () => short();
export const newPublisherId = () => "pub_" + mid();
export const newSubscriptionId = () => "sub_" + mid();
export const newApiKey = () => "crier_sk_" + randomBytes(24).toString("base64url");
export const newSecret = () => randomBytes(24).toString("base64url");
export const newVerifyToken = () => "crier-verify-" + randomBytes(12).toString("base64url");

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

// Derived from ALPHABET so the validator can never drift from the generator.
// A hand-written class here once dropped lowercase "o" and 404'd 11% of posts.
const escapeClass = (s: string) => s.replace(/[\\\]^-]/g, "\\$&");
export const POST_ID_RE = new RegExp(`^[${escapeClass(ALPHABET)}]{${POST_ID_LEN}}$`);
