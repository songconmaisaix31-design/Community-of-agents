import { test, expect } from "@playwright/test";
import type { AgentGraph, BulletinRecord, Owner } from "../../lib/gongzhi/contracts";
import { seedNetwork, storyResult } from "../../mocks/fixtures";
// These intercepted HTTP fixtures verify browser behavior, not live Agent execution.
const time = "2026-09-13T00:00:00.000Z";
const owner = (id: string): Owner => ({ id, publisher_id: id, kind: "external_agent", name: id, capabilities: [], revoked_at: null, last_seen_at: null, created_at: time, mode: "live" });
const record = (id: string, speaker_id: string, reply_to_id: string | null): BulletinRecord => ({ id, speaker_id, speaker: owner(speaker_id), owner_id: "human", thread_id: "thread", reply_to_id, kind: "reply", title: id, body: "公开 HTTP 测试记录", need_revision: 1, created_at: time, mode: "live" });
test("new communication and duplicate graph response retain camera and stable membership", async ({ page }) => {
  const records = [record("first", "A", null), record("second", "B", "first"), record("third", "C", "second")]; let more = false;
  const graph = (): AgentGraph => ({ mode: "live", nodes: ["A", "B", "C", "A"].map(id => ({ id, label: id, kind: "external_agent", owner_id: "human", mode: "live" })), edges: [{ id: "edge-one", source: "B", target: "A", evidence_id: "second", reply_to_id: "first", thread_id: "thread", mode: "live" }, ...(more ? [{ id: "edge-two", source: "C", target: "B", evidence_id: "third", reply_to_id: "second", thread_id: "thread", mode: "live" as const }] : [])] });
  await page.route("**/api/gongzhi/board?*", r => r.fulfill({ json: { ok: true, mode: "live", data: { records: records.slice(0, more ? 3 : 2), next_cursor: null, mode: "live" } } }));
  await page.route("**/api/gongzhi/agent-graph", r => r.fulfill({ json: { ok: true, mode: "live", data: graph() } }));
  await page.route("**/api/gongzhi/records/*", r => r.fulfill({ json: { ok: true, mode: "live", data: records.find(x => x.id === r.request().url().split("/").at(-1)) } }));
  await page.goto("/network"); await expect(page.getByTestId("agent-canvas")).toHaveAttribute("data-state", "ready"); await expect(page.locator(".agent-list button")).toHaveCount(3);
  const canvas = await page.locator(".cosmos-host canvas").elementHandle(); await page.getByRole("button", { name: "放大点图", exact: true }).click();
  const camera = () => page.locator(".cosmos-host canvas").evaluate(el => JSON.stringify((el as HTMLElement & { __zoom: unknown }).__zoom)); const before = await camera(); const imageBefore = await page.locator(".cosmos-host canvas").screenshot();
  more = true; await page.getByRole("button", { name: "刷新公开记录" }).click(); await expect(page.locator(".bulletin-card")).toHaveCount(3); await expect(page.locator(".agent-list button")).toHaveCount(3); expect(await camera()).toBe(before); expect(await canvas!.evaluate(el => el.isConnected)).toBe(true); expect((await page.locator(".cosmos-host canvas").screenshot()).equals(imageBefore)).toBe(false);
  await page.locator(".communication-list summary").click(); await page.locator(".communication-list button").last().click(); await expect(page.locator("[data-evidence-record=third]")).toBeVisible(); await expect(page.locator("[data-evidence-record=second]")).toBeVisible();
});

test("full records and exact experience versions remain accessible outside the latest network snapshot", async ({ page }) => {
  const original = seedNetwork(), exact = original.experiences[0], need = original.needs.find(n => n.id === "story-c")!, result = { ...storyResult("F-C")!, id: "result-F-C", created_at: time }; const live = <T,>(value: T): T => JSON.parse(JSON.stringify(value).replaceAll('"mode":"demo"', '"mode":"live"'));
  const n = live({ ...original, experiences: [], results: [], needs: [], graph: { nodes: [], edges: [] } }); let reads = 0;
  const posted: BulletinRecord = { ...record(result.id, result.owner_id, null), kind: "result", thread_id: need.id, title: result.title, body: result.body };
  await page.route("**/api/gongzhi/network", r => r.fulfill({ json: { ok: true, mode: "live", data: n } }));
  await page.route("**/api/gongzhi/agent-graph", r => r.fulfill({ json: { ok: true, mode: "live", data: { nodes: [], edges: [], mode: "live" } } }));
  await page.route("**/api/gongzhi/board?*", r => r.fulfill({ json: { ok: true, mode: "live", data: { records: [posted], next_cursor: null, mode: "live" } } }));
  await page.route("**/api/gongzhi/threads/*", r => r.fulfill({ json: { ok: true, mode: "live", data: { thread_id: need.id, records: [posted], next_cursor: null, mode: "live" } } }));
  await page.route("**/api/gongzhi/records/*", r => r.fulfill({ json: { ok: true, mode: "live", data: r.request().url().endsWith(exact.id) ? { ...posted, id: exact.id, thread_id: exact.id, kind: "experience" } : posted } }));
  await page.route(`**/api/gongzhi/needs/${need.id}`, r => r.fulfill({ json: { ok: true, mode: "live", data: live({ need, results: [result], decisions: [] }) } }));
  await page.route(`**/api/gongzhi/experiences/${exact.id}`, r => { reads++; return r.fulfill({ json: { ok: true, mode: "live", data: live(exact) } }); });
  await page.goto("/network"); await page.locator(".record-open").click(); await page.getByRole("button", { name: "完整记录与来源", exact: true }).click(); await expect(page.getByRole("heading", { name: result.title })).toBeVisible(); await page.getByRole("button", { name: "查看对应经验 · v1" }).click(); await expect(page.getByRole("heading", { name: exact.title })).toBeVisible(); expect(reads).toBe(1); await expect(page.getByText(/保存，是留作参考；引用/)).toBeVisible();
});
