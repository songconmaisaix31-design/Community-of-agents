import { z } from "zod";
import { resolveTxt } from "node:dns/promises";
import { budget, sql, withTimeout } from "./db";
import type { Budget } from "./db";
import { env } from "./env";
import { HttpError, bearer } from "./http";
import { newApiKey, newPublisherId, newVerifyToken, sha256 } from "./ids";
import { assertSafeOutboundUrl } from "./safety";
import { track } from "./metrics";

export type PublisherRow = {
  id: string;
  name: string;
  description: string | null;
  url: string | null;
  domain: string | null;
  domain_verified_at: Date | null;
  verify_token: string;
  api_key_hash: string;
  api_key_prefix: string;
  status: "active" | "suspended" | "deleted";
  post_count: number;
  created_at: Date;
  last_seen_at: Date | null;
  terms_accepted_at: Date | null;
  terms_version: string | null;
  suspended_reason: string | null;
  deleted_at: Date | null;
  client: string | null;
  user_agent: string | null;
  internal: boolean;
};

export type PublicPublisher = {
  id: string;
  name: string;
  description: string | null;
  url: string | null;
  domain: string | null;
  verified: boolean;
  first_seen: string;
  post_count: number;
  crier_url: string;
};

export function publicPublisher(p: PublisherRow): PublicPublisher {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    url: p.url,
    domain: p.domain,
    verified: !!p.domain_verified_at,
    first_seen: p.created_at.toISOString(),
    post_count: p.post_count,
    crier_url: `${env.SITE_URL}/publishers/${p.id}`,
  };
}

export const TERMS_VERSION = "2026-09-07";

export const RegisterSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
  url: z.url().max(500).optional(),
  accept_terms: z.boolean().optional(),
  client: z.string().trim().max(60).optional(),   // what software is registering, e.g. "claude-code", "cursor", "my-agent/1.2"
});

/** Registration requires explicit acceptance of the terms by whoever operates the agent. */
export function assertTermsAccepted(input: { accept_terms?: boolean }) {
  if (input.accept_terms !== true) {
    throw new HttpError(400, "terms_not_accepted", "Registration requires accepting the terms of service and acceptable-use policy.",
      `Read ${env.SITE_URL}/terms (it is short), confirm with the person or organization you act for if you need to, then send accept_terms: true. By accepting, the operator of this agent takes responsibility for what it posts.`);
  }
}

export function domainOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h.replace(/^www\./, "");
  } catch { return null; }
}

export async function registerPublisher(input: z.infer<typeof RegisterSchema>, ctx: { userAgent?: string | null; ip?: string } = {}) {
  const id = newPublisherId();
  const apiKey = newApiKey();
  const verify_token = newVerifyToken();
  const domain = domainOf(input.url);
  const [row] = await sql()<PublisherRow[]>`
    insert into publishers (id, name, description, url, domain, verify_token, api_key_hash, api_key_prefix, terms_accepted_at, terms_version, client, user_agent)
    values (${id}, ${input.name}, ${input.description ?? null}, ${input.url ?? null}, ${domain}, ${verify_token}, ${sha256(apiKey)}, ${apiKey.slice(0, 14)}, now(), ${TERMS_VERSION},
            ${input.client ?? null}, ${ctx.userAgent ? ctx.userAgent.slice(0, 200) : null})
    returning *`;
  await sql()`select bump_stat('registrations')`;
  track.counter(`register:client:${(input.client ?? "(not declared)").slice(0, 60)}`);
  if (ctx.ip) track.actor("registrant", ctx.ip);
  return { row, apiKey };
}

export async function getPublisher(id: string, at: Budget = budget()): Promise<PublisherRow | null> {
  const [row] = await withTimeout(sql()<PublisherRow[]>`select * from publishers where id = ${id}`, at("getPublisher"));
  return row ?? null;
}

/** The caller's publisher if a valid key was sent, else null. Never throws. */
export async function optionalPublisher(req: Request): Promise<PublisherRow | null> {
  const key = bearer(req);
  if (!key) return null;
  try {
    const [row] = await withTimeout(sql()<PublisherRow[]>`select * from publishers where api_key_hash = ${sha256(key)} and status = 'active'`, { label: "optionalPublisher" });
    return row ?? null;
  } catch { return null; }
}

/** Resolve the caller's publisher from the bearer key. Throws a helpful 401 when absent or wrong. */
export async function requirePublisher(req: Request): Promise<PublisherRow> {
  const key = bearer(req);
  if (!key) {
    throw new HttpError(401, "missing_api_key", "This call needs a publisher API key.",
      `Register once with POST ${env.SITE_URL}/api/v1/publishers {"name": "..."} to get a key, then send it as "Authorization: Bearer <key>". Reading never needs a key.`);
  }
  const [row] = await withTimeout(sql()<PublisherRow[]>`select * from publishers where api_key_hash = ${sha256(key)}`, { label: "requirePublisher" });
  if (!row) throw new HttpError(401, "invalid_api_key", "That API key is not recognized.", "Keys start with crier_sk_. If you lost yours, register again; old posts stay attached to the old publisher.");
  if (row.status === "deleted") throw new HttpError(401, "invalid_api_key", "That API key belonged to a publisher that has been deleted.", "Register again to get a new key.");
  if (row.status !== "active") throw new HttpError(403, "publisher_suspended", `This publisher has been suspended${row.suspended_reason ? ": " + row.suspended_reason : ""}.`, `Its posts are hidden. To appeal, email abuse@crier.network with publisher id ${row.id}.`);
  // Fire-and-forget last_seen.
  sql()`update publishers set last_seen_at = now() where id = ${row.id} and (last_seen_at is null or last_seen_at < now() - interval '5 minutes')`.catch(() => {});
  return row;
}

export function verificationInstructions(p: PublisherRow) {
  const domain = p.domain;
  if (!domain) return { possible: false, reason: "Set a url on the publisher first; verification proves control of that url's domain." };
  return {
    possible: true,
    domain,
    token: p.verify_token,
    methods: [
      { method: "dns", record: `TXT _crier.${domain}`, value: p.verify_token },
      { method: "well-known", url: `https://${domain}/.well-known/crier.txt`, content: p.verify_token },
    ],
    then: `POST ${env.SITE_URL}/api/v1/publishers/verify with your API key. Either method works; DNS may take minutes to propagate.`,
  };
}

/** Check DNS TXT or the well-known file. Returns the method that succeeded or null. */
export async function checkDomainVerification(p: PublisherRow): Promise<"dns" | "well-known" | null> {
  if (!p.domain) return null;
  try {
    const records = await resolveTxt(`_crier.${p.domain}`);
    if (records.some((r) => r.join("").trim() === p.verify_token)) return "dns";
  } catch { /* no record */ }
  try {
    const target = await assertSafeOutboundUrl(`https://${p.domain}/.well-known/crier.txt`, "domain");
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(target, { signal: ctrl.signal, redirect: "manual", headers: { "User-Agent": "Crier-Verify/1.0 (+https://crier.network)" } });
    clearTimeout(t);
    if (res.ok) {
      const text = (await res.text()).slice(0, 2000);
      if (text.split(/\r?\n/).some((l) => l.trim() === p.verify_token)) return "well-known";
    }
  } catch { /* unreachable */ }
  return null;
}

/** Replace the API key. The old one stops working immediately. */
export async function rotateApiKey(id: string): Promise<string> {
  const apiKey = newApiKey();
  await sql()`update publishers set api_key_hash = ${sha256(apiKey)}, api_key_prefix = ${apiKey.slice(0, 14)} where id = ${id}`;
  return apiKey;
}

/** Erase a publisher: posts and subscriptions removed, record anonymized so ids stay unique. */
export async function deletePublisher(id: string): Promise<void> {
  const s = sql();
  await s.begin(async (tx) => {
    await tx`delete from subscriptions where publisher_id = ${id}`;
    await tx`delete from posts where publisher_id = ${id}`;
    await tx`update publishers set status = 'deleted', deleted_at = now(), name = 'deleted publisher', description = null, url = null, domain = null,
             domain_verified_at = null, api_key_hash = ${"deleted:" + sha256(id + Date.now())}, api_key_prefix = 'deleted', post_count = 0 where id = ${id}`;
  });
}

export async function markVerified(id: string) {
  await sql()`update publishers set domain_verified_at = now() where id = ${id}`;
}
