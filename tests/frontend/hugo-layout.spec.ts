import { test, expect } from "@playwright/test";
import type { AgentGraph, BulletinRecord, Owner } from "../../lib/gongzhi/contracts";
import path from "node:path";
import { tmpdir } from "node:os";
import { readFileSync } from "node:fs";
import { canvasPoints } from "./canvas-pixels";
const time = "2026-09-13T00:00:00.000Z";
// Layout-only HTTP fixture: sixty-eight explicitly named test agents, never product demo data.
const owners: Owner[] = Array.from({ length: 68 }, (_, i) => ({ id: `layout-agent-${i}`, publisher_id: `layout-publisher-${i}`, name: `布局测试 Agent ${i}`, kind: i % 3 === 0 ? "platform_agent" : "external_agent", capabilities: [], revoked_at: null, last_seen_at: null, created_at: time, mode: "live" }));
const records: BulletinRecord[] = owners.map(o => ({ id: `record-${o.id}`, thread_id: `record-${o.id}`, reply_to_id: null, speaker_id: o.id, owner_id: "layout-test-human", speaker: o, kind: "experience", title: `${o.name} 的测试记录`, body: "仅用于多节点布局浏览器测试的公开 HTTP 替身，不代表真实 Agent 执行。", need_revision: null, created_at: time, mode: "live" }));
const graph: AgentGraph = { mode: "live", nodes: owners.map(o => ({ id: o.id, kind: o.kind as "external_agent" | "platform_agent", label: o.name, owner_id: "layout-test-human", mode: "live" })), edges: Array.from({ length: 37 }, (_, i) => { const a = (i % 30) * 2, b = a + 1, target = records[a]; const source: BulletinRecord = { ...records[b], id: `layout-reply-${i}`, thread_id: target.id, reply_to_id: target.id, kind: "reply" }; records.push(source); return { id: `layout-edge-${i}`, source: source.speaker_id, target: target.speaker_id, evidence_id: source.id, reply_to_id: target.id, thread_id: target.id, mode: "live" }; }) };
const snapshot = process.env.GONGZHI_LAYOUT_PUBLIC_GRAPH ? JSON.parse(readFileSync(process.env.GONGZHI_LAYOUT_PUBLIC_GRAPH, "utf8")) as AgentGraph : null;
const testedGraph = snapshot || graph;
const testedRecords: BulletinRecord[] = snapshot ? snapshot.nodes.map((n, i) => ({ ...records[i % 68], id: `layout-record-${n.id}`, thread_id: `layout-record-${n.id}`, speaker_id: n.id, speaker: { ...owners[i % 68], id: n.id, name: n.label, kind: n.kind }, title: `布局回放测试：${n.label}` })) : records;
for (const width of [1440, 390]) test(`${testedGraph.nodes.length} sparse agents distribute into individually visible points at ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1100 });
  await page.route("**/api/gongzhi/agent-graph", r => r.fulfill({ json: { ok: true, mode: "live", data: testedGraph } }));
  await page.route("**/api/gongzhi/board?*", r => r.fulfill({ json: { ok: true, mode: "live", data: { records: testedRecords, next_cursor: null, mode: "live" } } }));
  await page.goto("/network"); await expect(page.getByTestId("agent-canvas")).toHaveAttribute("data-state", "ready"); await expect(page.locator(".agent-list button")).toHaveCount(testedGraph.nodes.length);
  await page.locator(".truth-note p").evaluate(el => { el.textContent = "布局回放测试：公开拓扑 HTTP 替身，仅验证点图分布，不代表真实 Agent 执行。"; });
  const canvas = page.locator(".cosmos-host canvas");
  const { points } = await canvasPoints(page);
  await page.screenshot({ path: path.join(tmpdir(), "gongzhi-hugo-evidence", `hugo-layout-${snapshot ? "public-snapshot" : "68"}-${width}.png`), fullPage: false });
  expect(points.length, "At least 88% of points must be separately visible, with no outlier shrinking the cluster").toBeGreaterThanOrEqual(Math.ceil(testedGraph.nodes.length * 0.88));
  expect(Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y))).toBeGreaterThan(100);
  const p = points[Math.floor(points.length / 2)], bounds = (await canvas.boundingBox())!; await page.mouse.move(bounds.x + p.x, bounds.y + p.y); await expect(page.locator(".graph-tooltip")).toHaveText(/\S+/); await page.mouse.click(bounds.x + p.x, bounds.y + p.y); await expect(page.locator('.agent-list button[aria-pressed="true"]')).toHaveCount(1); expect(await page.locator(".bulletin-card").count()).toBeGreaterThan(0);
});
