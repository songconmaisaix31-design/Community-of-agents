import test from "node:test";
import assert from "node:assert/strict";
import { CreateContentApprovalSchema, ExperienceSearchSchema, PostExperienceFeedbackSchema, PublishExperienceSchema, ReadExperienceVersionSchema } from "../../lib/gongzhi/contracts.ts";
import { ApiClientError, createApiClient } from "../../lib/gongzhi/api-client.ts";

const publication = { title: "Reviewed method", body: "Only the selected sanitized material", idempotency_key: "publish-once" };
const approval = { agent_id: "owned-agent", visibility: "public", content: { action: "publish_experience", payload: publication }, idempotency_key: "approve-once" };

test("content approval requires explicit public scope and a complete exact action, never a boolean assertion", () => {
  assert.equal(CreateContentApprovalSchema.parse(approval).expires_in_seconds, 900);
  for (const extra of [{ visibility: "private" }, { visibility: undefined }, { approved: true }, { owner_id: "other" }, { expires_in_seconds: 3601 }]) {
    assert.equal(CreateContentApprovalSchema.safeParse({ ...approval, ...extra }).success, false);
  }
  assert.equal(CreateContentApprovalSchema.safeParse({ ...approval, content: { action: "publish_experience", payload: { ...publication, approval_id: "recursive" } } }).success, false);
  assert.equal(PublishExperienceSchema.safeParse({ ...publication, approved: true }).success, false);
  assert.equal(ReadExperienceVersionSchema.safeParse({ id: "e", revision: 0 }).success, false);
  assert.equal(ExperienceSearchSchema.safeParse({ limit: 100 }).success, false);
  assert.equal(PostExperienceFeedbackSchema.safeParse({ experience_id: "e", revision: 1, usage: "Tested locally", body: "Outcome", outcome: "helpful", visibility: "public", idempotency_key: "feedback", owner_id: "forged" }).success, false);
});

test("publish accepts optional based_on_feedback_ids and search accepts tag/cursor without a new kind taxonomy", () => {
  assert.equal(PublishExperienceSchema.parse(publication).based_on_feedback_ids, undefined);
  assert.deepEqual(PublishExperienceSchema.parse({ ...publication, based_on_feedback_ids: ["fb-1", "fb-2"] }).based_on_feedback_ids, ["fb-1", "fb-2"]);
  assert.equal(PublishExperienceSchema.safeParse({ ...publication, based_on_feedback_ids: "fb-1" }).success, false);
  assert.equal(PublishExperienceSchema.safeParse({ ...publication, based_on_feedback_ids: ["fb-1", ""] }).success, false);
  assert.equal(PublishExperienceSchema.safeParse({ ...publication, based_on_feedback_ids: Array.from({ length: 11 }, (_, i) => `fb-${i}`) }).success, false);
  assert.equal(ExperienceSearchSchema.safeParse({ tag: "reviewed", cursor: "abc", limit: 5 }).success, true);
  assert.equal(ExperienceSearchSchema.safeParse({ kind: "review" }).success, false, "kind is not a search dimension; no new taxonomy");
});

test("shared experience clients use canonical paths and preserve the single mode and Bearer boundary", async () => {
  const seen: { url: string; method: string; authorization?: string }[] = [];
  const api = createApiClient("live", { accessToken: () => "synthetic-test-token", fetch: (async (url, init) => {
    seen.push({ url: String(url), method: init!.method!, authorization: (init!.headers as Record<string, string>).Authorization });
    return Response.json({ ok: true, mode: "live", data: {} });
  }) as typeof fetch });
  await api.searchExperience({ q: "specific method", limit: 5, tag: "reviewed", cursor: "abc" });
  await api.readExperienceVersion("e/1", 2);
  await api.readExperienceLineage("e/1");
  await api.createContentApproval(CreateContentApprovalSchema.parse(approval));
  await api.listContentApprovals();
  await api.revokeContentApproval("a/1");
  await api.postExperienceFeedback(PostExperienceFeedbackSchema.parse({ experience_id: "e", revision: 2, usage: "Local check", body: "Reviewed feedback", outcome: "helpful", visibility: "public", idempotency_key: "feedback" }));
  assert.deepEqual(seen.map(({ url, method }) => [url, method]), [
    ["/api/gongzhi/experiences/search?q=specific+method&limit=5&tag=reviewed&cursor=abc", "GET"],
    ["/api/gongzhi/experiences/e%2F1/versions/2", "GET"],
    ["/api/gongzhi/experiences/e%2F1/lineage", "GET"],
    ["/api/gongzhi/content-approvals", "POST"], ["/api/gongzhi/content-approvals", "GET"],
    ["/api/gongzhi/content-approvals/a%2F1", "DELETE"], ["/api/gongzhi/experience-feedback", "POST"],
  ]);
  assert.ok(seen.every(request => request.authorization === "Bearer synthetic-test-token"));
});

test("lost or unreadable confirmation writes remain unknown without automatic retries", async () => {
  for (const unreadable of [false, true]) {
    let calls = 0;
    const api = createApiClient("live", { fetch: (async () => {
      calls++;
      if (unreadable) return new Response("not-json", { status: 200 });
      throw new Error("Response lost after possible persistence");
    }) as typeof fetch });
    await assert.rejects(api.createContentApproval(CreateContentApprovalSchema.parse(approval)), (error: unknown) => error instanceof ApiClientError && error.error.code === "unknown" && error.error.retryable === false);
    assert.equal(calls, 1);
  }
});
