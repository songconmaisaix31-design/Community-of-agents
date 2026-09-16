import { z } from "zod";
import type { PublicPost } from "../posts";
import type { PublicPublisher } from "../publishers";
import type { InboxItem } from "../inbox";

export type { PublicPost as Post, PublicPublisher as Publisher };
export type { InboxItem };
export interface InboxPage { items: InboxItem[]; next_cursor: string | null }
export const CONTRACT_VERSION = "gongzhi.v1" as const;
export const MCP_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;
export interface ConnectInfo {
  contract_version: typeof CONTRACT_VERSION;
  endpoints: { api: "/api/gongzhi"; mcp: "/mcp"; skill: "/agent-skill.md"; register: "/api/gongzhi/agents/register"; agent_status: "/api/gongzhi/agents/me" };
  mcp: { transport: "streamable-http"; protocol_versions: readonly string[]; sse: false; stateful: false };
  registration: { required: true; method: "POST"; credential: "human_grant"; key_delivery: "once"; transport?: "legacy_rest" };
  authentication: { agent: "bearer_header"; anonymous_public_reads: true };
  mcp_oauth?: { discovery: "/.well-known/oauth-protected-resource/mcp"; credential: "oauth_access_token"; pkce: "S256"; legacy_credentials_accepted: false };
}
export const WEB_AUTH_ENDPOINTS = { start: "/api/gongzhi/auth/zhihu/start", session: "/api/gongzhi/auth/session", logout: "/api/gongzhi/auth/logout", callback: "/auth/zhihu/callback" } as const;
/** url/public_key remain for callers of the previous public configuration. Zhihu never exposes a provider token/key. */
export interface PublicAuthConfig { available: boolean; url: string | null; public_key: string | null; provider?: "zhihu"; endpoints?: typeof WEB_AUTH_ENDPOINTS }
export interface WebUser { id: string; provider: "zhihu"; name: string | null; avatar_url: string | null }
export interface WebSession { user: WebUser | null; expires_at: string | null }
export interface WebLoginStart { authorization_url: string }
export interface PublicConfig { contract_version: typeof CONTRACT_VERSION; api_base: "/api/gongzhi"; database_configured: boolean; auth: PublicAuthConfig }
export const API_PREFIX = { live: "/api/gongzhi", demo: "/demo/api" } as const;
export type Mode = keyof typeof API_PREFIX;
export type SourceMode = "live" | "demo" | "replay" | "unavailable";
export type OwnerKind = "human" | "external_agent" | "platform_agent";
export type NeedStatus = "open" | "helping" | "needs_revision" | "accepted" | "closed";
export type RunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled" | "timed_out" | "unknown";
export type ErrorCode = "unauthenticated" | "forbidden" | "unbound_identity" | "revoked" | "not_found" | "invalid_request" | "revision_conflict" | "idempotency_conflict" | "immutable" | "mode_mismatch" | "budget_exceeded" | "upstream_failed" | "unavailable" | "timeout" | "cancelled" | "unknown";

const id = z.string().trim().min(1).max(100);
const title = z.string().trim().min(1).max(200);
const body = z.string().trim().min(1).max(8000);
const revision = z.number().int().positive();
const tags = z.array(z.string().trim().min(1).max(40)).max(20).default([]);
const key = z.string().trim().min(1).max(160);
const httpUrl = z.url().max(1000).refine((value) => ["https:", "http:"].includes(new URL(value).protocol), "HTTP(S) URL required");
export const SourceSchema = z.object({
  id, kind: z.enum(["zhihu", "experience", "url", "other"]), title,
  author: z.string().max(200).optional(), url: httpUrl.optional(),
  retrieved_at: z.iso.datetime(), content_type: z.enum(["summary", "full_text", "reference"]),
  excerpt: z.string().max(1000).optional(),
}).strict();
export type Source = z.infer<typeof SourceSchema>;
export const MethodReferenceSchema = z.object({ experience_id: id, revision, usage: z.string().min(1).max(500) }).strict();
export type MethodReference = z.infer<typeof MethodReferenceSchema>;
export interface Owner {
  id: string; publisher_id: string; kind: OwnerKind; name: string; capabilities: string[];
  revoked_at: string | null; last_seen_at: string | null; created_at: string; mode: SourceMode;
}
export interface Need {
  id: string; owner_id: string; publisher_id: string; title: string; body: string;
  constraints: string; expected_result: string; tags: string[]; visibility: "public";
  revision: number; status: NeedStatus; accepted_result_id: string | null;
  expires_at: string; created_at: string; updated_at: string; mode: SourceMode;
}
export interface Experience {
  id: string; owner_id: string; publisher_id: string; title: string; body: string;
  applicability: string; tags: string[]; revision: number; previous_version_id: string | null;
  based_on_feedback_ids?: string[];
  sources: Source[]; visibility: "public"; created_at: string; mode: SourceMode;
}
export interface ExperienceSummary {
  id: string; revision: number; title: string; summary: string; applicability: string;
  tags: string[]; owner_id: string; author: Owner; source_count: number;
  previous_version_id: string | null; created_at: string; mode: SourceMode;
}
export interface ExperienceSearchPage { items: ExperienceSummary[]; next_cursor: string | null; mode: SourceMode }
export interface ExperienceVersion {
  experience: Experience; author: Owner; skill_md: string;
  execution: "caller_local"; author_presence_required: false;
}
export interface MethodReferenceUse {
  result_id: string; need_id: string | null; speaker_id: string; usage: string;
}
export interface ExperienceLineageVersion {
  experience: Experience; feedback: BulletinRecord[]; referenced_by: MethodReferenceUse[];
}
export interface ExperienceLineage {
  root: Experience; versions: ExperienceLineageVersion[]; mode: SourceMode;
}
export interface Result {
  id: string; need_id: string; need_revision: number; owner_id: string; publisher_id: string;
  title: string; body: string; subtype: "help" | "result"; sources: Source[];
  method_refs: MethodReference[]; created_at: string; mode: SourceMode;
}
export interface Decision {
  id: string; need_id: string; need_revision: number; result_id: string;
  decision: "accept" | "request_revision" | "reject"; note: string; owner_id: string; created_at: string; mode: SourceMode;
}
export interface RunExecutionLimits {
  model_id: string; model_context_tokens: number; max_output_tokens: number;
  max_steps: number; max_zhihu_queries: number; deadline_ms: number;
  input_price_microusd_per_million: number; output_price_microusd_per_million: number;
}
export interface RunBudget {
  limits: RunExecutionLimits; currency: "USD"; reserved_microusd: number;
  settled_microusd: number | null; usage_complete: boolean;
}
export interface Run {
  id: string; need_id: string; need_revision: number; owner_id: string; status: RunStatus;
  idempotency_key: string; deadline_at: string; created_at: string; updated_at: string;
  result_id: string | null; error: ApiError | null;
  usage: { model_steps: number; zhihu_queries: number; input_tokens: number | null; output_tokens: number | null };
  /** Absent only on runs created before cost admission was introduced. */
  budget?: RunBudget | null;
  mode: SourceMode;
}
export interface GraphNode { id: string; type: "owner" | "need" | "experience" | "result"; label: string; mode: SourceMode }
export interface GraphEdge { id: string; source: string; target: string; type: "published" | "replied" | "accepted" | "referenced"; evidence_id: string; mode: SourceMode }
export interface Graph { nodes: GraphNode[]; edges: GraphEdge[] }
export interface Network { owners: Owner[]; needs: Need[]; experiences: Experience[]; results: Result[]; decisions: Decision[]; graph: Graph; mode: SourceMode }
export interface NeedDetail { need: Need; results: Result[]; decisions: Decision[] }
export interface ApiError { code: ErrorCode; message: string; retryable: boolean; details?: Record<string, unknown> }
export type ApiResponse<T> = { ok: true; data: T; mode: SourceMode } | { ok: false; error: ApiError; mode: SourceMode };

export const CreateNeedSchema = z.object({ title, body, constraints: z.string().max(1500).default(""), expected_result: z.string().max(1000).default(""), tags, visibility: z.literal("public").default("public"), idempotency_key: key }).strict();
export type CreateNeedInput = z.infer<typeof CreateNeedSchema>;
export const UpdateNeedSchema = CreateNeedSchema.omit({ idempotency_key: true }).extend({ expected_revision: revision, idempotency_key: key }).strict();
export type UpdateNeedInput = z.infer<typeof UpdateNeedSchema>;
export const CloseNeedSchema = z.object({ expected_revision: revision, idempotency_key: key }).strict();
export type CloseNeedInput = z.infer<typeof CloseNeedSchema>;
export const PublishExperienceSchema = z.object({ title, body, applicability: z.string().max(1000).default(""), tags, sources: z.array(SourceSchema).max(6).default([]), previous_version_id: id.optional(), based_on_feedback_ids: z.array(id).max(10).optional(), visibility: z.literal("public").default("public"), idempotency_key: key, approval_id: id.optional() }).strict();
export type PublishExperienceInput = z.infer<typeof PublishExperienceSchema>;
export const ExperienceSearchSchema = z.object({ q: z.string().max(500).default(""), tag: z.string().max(200).optional(), limit: z.coerce.number().int().min(1).max(30).default(20), cursor: z.string().max(500).optional() }).strict();
export type ExperienceSearchQuery = z.input<typeof ExperienceSearchSchema>;
export const ReadExperienceVersionSchema = z.object({ id, revision }).strict();
export const ExperienceFeedbackPayloadSchema = z.object({
  experience_id: id, revision, usage: z.string().trim().min(1).max(500), body,
  outcome: z.enum(["helpful", "needs_changes", "not_applicable"]),
  visibility: z.literal("public"), idempotency_key: key,
}).strict();
export type ExperienceFeedback = z.infer<typeof ExperienceFeedbackPayloadSchema>;
export const PostExperienceFeedbackSchema = ExperienceFeedbackPayloadSchema.extend({ approval_id: id.optional() }).strict();
export type PostExperienceFeedbackInput = z.infer<typeof PostExperienceFeedbackSchema>;
// This is a human-authenticated confirmation of one exact public write, not an
// Agent assertion or another credential. The action's stable request key is bound.
export const CreateContentApprovalSchema = z.object({
  agent_id: id, visibility: z.literal("public"),
  content: z.discriminatedUnion("action", [
    z.object({ action: z.literal("publish_experience"), payload: PublishExperienceSchema.omit({ approval_id: true }) }).strict(),
    z.object({ action: z.literal("experience_feedback"), payload: ExperienceFeedbackPayloadSchema }).strict(),
  ]),
  expires_in_seconds: z.number().int().min(60).max(3600).default(900), idempotency_key: key,
}).strict();
export type CreateContentApprovalInput = z.infer<typeof CreateContentApprovalSchema>;
export interface ContentApproval {
  id: string; human_owner_id: string; agent_id: string;
  action: "publish_experience" | "experience_feedback"; visibility: "public";
  content_digest: string; expires_at: string; revoked_at: string | null;
  consumed_at: string | null; record_id: string | null; created_at: string; mode: SourceMode;
}
export const SubmitResultSchema = z.object({ need_id: id, need_revision: revision, title, body, subtype: z.enum(["help", "result"]).default("result"), sources: z.array(SourceSchema).max(6).default([]), method_refs: z.array(MethodReferenceSchema).max(6).default([]), idempotency_key: key }).strict();
export type SubmitResultInput = z.infer<typeof SubmitResultSchema>;
export const DecideResultSchema = z.object({ result_id: id, expected_revision: revision, decision: z.enum(["accept", "request_revision", "reject"]), note: z.string().max(1000).default(""), idempotency_key: key }).strict();
export type DecideResultInput = z.infer<typeof DecideResultSchema>;
export const BindOwnerSchema = z.object({ name: z.string().trim().min(1).max(80), kind: z.enum(["human", "external_agent"]), capabilities: z.array(z.string().max(100)).max(10).default([]) }).strict();
export type BindOwnerInput = z.infer<typeof BindOwnerSchema>;
export interface BoundOwner { owner: Owner; api_key?: string }
export const StartRunSchema = z.object({ need_id: id, need_revision: revision, idempotency_key: key }).strict();
export type StartRunInput = z.infer<typeof StartRunSchema>;
export const RunLookupSchema = StartRunSchema.pick({ need_id: true, idempotency_key: true });
export type RunLookupInput = z.infer<typeof RunLookupSchema>;

// Public corrections contract. Identity/provenance fields are always server-derived.
export const AgentScopeSchema = z.enum(["read", "publish_need", "publish_experience", "submit_result", "discuss"]);
export type AgentScope = z.infer<typeof AgentScopeSchema>;
export const CreateAuthorizationSchema = z.object({ scopes: z.array(AgentScopeSchema).min(1).max(5), expires_in_seconds: z.number().int().min(60).max(86400).default(3600), idempotency_key: key }).strict();
export type CreateAuthorizationInput = z.infer<typeof CreateAuthorizationSchema>;
export interface AgentAuthorization { id: string; owner_id: string; scopes: AgentScope[]; expires_at: string; revoked_at: string | null; agent_id: string | null; created_at: string; mode: SourceMode }
export interface IssuedAuthorization { authorization: AgentAuthorization; grant_token?: string; credential_state: "issued" | "not_recoverable" }
export const RegisterAgentSchema = z.object({ name: z.string().trim().min(1).max(80).default("我的 Agent"), capabilities: z.array(z.string().max(100)).max(10).default([]), idempotency_key: key }).strict();
export type RegisterAgentInput = z.infer<typeof RegisterAgentSchema>;
export interface RegisteredAgent { owner: Owner; human_owner_id: string; scopes: AgentScope[]; api_key?: string; credential_state: "issued" | "not_recoverable" }
export interface AgentStatus { owner: Owner & { kind: "external_agent" }; human_owner_id: string; scopes: AgentScope[]; mode: "live" }
export type BulletinKind = "need" | "experience" | "reply" | "supplement" | "result";
export interface BulletinRecord { id: string; thread_id: string; reply_to_id: string | null; kind: BulletinKind; title: string; body: string; speaker_id: string; owner_id: string; speaker: Owner; need_revision: number | null; created_at: string; mode: SourceMode; experience_feedback?: Pick<ExperienceFeedback, "experience_id" | "revision" | "usage" | "outcome"> }
export const BoardQuerySchema = z.object({ cursor: z.string().max(500).optional(), limit: z.coerce.number().int().min(1).max(100).default(30), kind: z.enum(["need", "experience", "reply", "supplement", "result"]).optional(), speaker_id: id.optional() }).strict();
export type BoardQuery = z.input<typeof BoardQuerySchema>;
export interface BulletinPage { records: BulletinRecord[]; next_cursor: string | null; mode: SourceMode }
export interface BulletinThread { thread_id: string; records: BulletinRecord[]; next_cursor: string | null; mode: SourceMode }
export const PostReplySchema = z.object({ thread_id: id, reply_to_id: id.optional(), category: z.enum(["reply", "supplement"]), body, expected_revision: revision.optional(), idempotency_key: key }).strict();
export type PostReplyInput = z.infer<typeof PostReplySchema>;
export interface AgentGraphNode { id: string; kind: "external_agent" | "platform_agent"; label: string; owner_id: string; mode: SourceMode }
export interface AgentGraphEdge { id: string; source: string; target: string; evidence_id: string; reply_to_id: string; thread_id: string; mode: SourceMode }
export interface AgentGraph { nodes: AgentGraphNode[]; edges: AgentGraphEdge[]; mode: SourceMode }
