import { test, expect, type APIRequestContext } from "@playwright/test";
import type { AgentGraph, BulletinThread, NeedDetail } from "../../lib/gongzhi/contracts";
import type { Graph } from "@cosmos.gl/graph";

// These IDs must come from separately witnessed real Agent execution. This
// read-only check establishes page/REST agreement, not Agent autonomy itself.
const needId = process.env.GONGZHI_ACCEPTANCE_NEED_ID;
const agentIds = process.env.GONGZHI_ACCEPTANCE_AGENT_IDS?.split(",") ?? [];
type ObservedWindow = Window & { __liveGraph?: Graph };
async function read<T>(request: APIRequestContext, path: string): Promise<T> {
  const response = await request.get("/api/gongzhi/" + path);
  expect(response.status()).toBe(200);
  const envelope = await response.json();
  expect(envelope.ok).toBe(true);
  expect(envelope.mode).toBe("live");
  return envelope.data;
}

test("real Agent records, evidence edges and full page thread agree", async ({ page, request }, info) => {
  expect(needId, "Supply the actual independently discussed need").toBeTruthy();
  expect(new Set(agentIds).size).toBe(2);
  const thread = await read<BulletinThread>(request, "threads/" + encodeURIComponent(needId!));
  const graph = await read<AgentGraph>(request, "agent-graph");
  for (const id of agentIds) {
    const nodes = graph.nodes.filter(n => n.id === id);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].kind).toBe("external_agent");
    expect(thread.records.some(r => r.speaker_id === id && ["reply", "supplement"].includes(r.kind))).toBe(true);
  }
  const edge = graph.edges.find(e => e.thread_id === needId && agentIds.includes(e.source) && agentIds.includes(e.target) && e.source !== e.target);
  expect(edge, "A concrete Agent-to-Agent reply must support the edge").toBeTruthy();
  const evidence = thread.records.find(r => r.id === edge!.evidence_id);
  const target = thread.records.find(r => r.id === edge!.reply_to_id);
  expect(evidence?.reply_to_id).toBe(target?.id);
  expect(evidence?.speaker_id).toBe(edge!.source);
  expect(target?.speaker_id).toBe(edge!.target);
  const external: string[] = [];
  page.on("request", request => {
    const url = new URL(request.url());
    if (["http:", "https:"].includes(url.protocol) && url.hostname !== "127.0.0.1") external.push(url.origin);
  });
  await page.goto("/zh");
  await expect(page.locator(`[data-record-id="${needId}"]`)).toBeVisible();
  for (const id of agentIds) await expect(page.locator(`[data-agent-id="${id}"]`)).toHaveCount(1);
  await page.locator(`[data-agent-id="${edge!.source}"]`).click();
  await expect(page.locator(`[data-record-id="${evidence!.id}"]`)).toBeVisible();
  await page.locator("[data-cm-speaker-clear]").click();
  await page.locator(`[data-record-id="${needId}"]`).click();
  const dialog = page.getByRole("dialog");
  for (const record of thread.records) await expect(dialog.locator(".cm-thread-record .cm-body").filter({ hasText: record.body })).toHaveCount(1);
  expect(external).toEqual([]);
  await page.screenshot({ path: info.outputPath("real-thread.png"), fullPage: true });
  await page.keyboard.press("Escape");
  await page.locator("#agents").scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("real-graph.png") });
  await page.reload();
  await expect(page.locator(`[data-record-id="${needId}"]`)).toBeAttached();
});

test("actual public records remain operable without WebGL", async ({ page }) => {
  expect(needId).toBeTruthy();
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      if (type.startsWith("webgl") || type === "experimental-webgl") return null;
      return original.apply(this, [type, ...args] as Parameters<typeof original>);
    } as typeof original;
  });
  await page.goto("/zh");
  await expect(page.locator(".cm-graph-fallback")).toBeVisible();
  await page.locator(`[data-record-id="${needId}"]`).click();
  await expect(page.getByRole("dialog").locator(".cm-thread-record").first()).toBeVisible();
});

test("actual canvas evidence click and Agent selection preserve the zoomed camera", async ({ page, request }, info) => {
  const data = await read<AgentGraph>(request, "agent-graph");
  const thread = await read<BulletinThread>(request, "threads/" + encodeURIComponent(needId!));
  expect(data.nodes).toHaveLength(2);
  await page.addInitScript(() => {
    let exported: Record<string, unknown>;
    Object.defineProperty(window, "GongzhiGraph", {
      configurable: true, get: () => exported,
      set: value => {
        exported = { ...value, mount: (...args: unknown[]) => {
          const graph = value.mount(...args);
          (window as ObservedWindow).__liveGraph = graph;
          return graph;
        } };
      },
    });
  });
  await page.goto("/zh");
  const canvas = page.locator(".cm-graph-wrap canvas");
  await expect(canvas).toBeVisible();
  await page.waitForFunction(() => (window as ObservedWindow).__liveGraph?.isReady);
  expect(await page.evaluate(() => (window as ObservedWindow).__liveGraph!.getPointPositions().length)).toBe(4);
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  const camera = () => page.evaluate(() => {
    const graph = (window as ObservedWindow).__liveGraph!;
    return { zoom: graph.getZoomLevel(), origin: graph.spaceToScreenPosition([0, 0]), unit: graph.spaceToScreenPosition([1, 1]) };
  });
  const initial = await camera();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -150);
  await expect.poll(async () => (await camera()).zoom).not.toBe(initial.zoom);
  let previous = "";
  await expect.poll(async () => { const next = JSON.stringify(await camera()); const stable = next === previous; previous = next; return stable; }, { intervals: [100, 150, 200] }).toBe(true);
  const before = await camera();
  const handle = await canvas.elementHandle();
  const midpoint = await page.evaluate(() => {
    const graph = (window as ObservedWindow).__liveGraph!, p = graph.getPointPositions();
    return graph.spaceToScreenPosition([(p[0] + p[2]) / 2, (p[1] + p[3]) / 2]);
  });
  await page.mouse.click(box.x + midpoint[0], box.y + midpoint[1]);
  await expect(page.getByRole("dialog")).toContainText("公开交流依据");
  const bodies = page.getByRole("dialog").locator(".cm-thread-record .cm-body");
  await expect(bodies).toHaveCount(2);
  const shown = await bodies.allTextContents();
  const ids = thread.records.filter(r => shown.includes(r.body)).map(r => r.id);
  expect(data.edges.some(e => ids.includes(e.evidence_id) && ids.includes(e.reply_to_id))).toBe(true);
  await page.screenshot({ path: info.outputPath("actual-edge-evidence.png"), fullPage: true });
  await page.keyboard.press("Escape");
  const chip = page.locator(`[data-agent-id="${agentIds[0]}"]`);
  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  expect(await camera()).toEqual(before);
  expect(await page.evaluate(el => el === document.querySelector(".cm-graph-wrap canvas"), handle)).toBe(true);
});

test("persisted result adoption belongs to the human owner and current revision", async ({ request }) => {
  expect(needId).toBeTruthy();
  const detail = await read<NeedDetail>(request, "needs/" + encodeURIComponent(needId!));
  expect(detail.need.status).toBe("accepted");
  const result = detail.results.find(r => r.id === detail.need.accepted_result_id);
  expect(result?.need_revision).toBe(detail.need.revision);
  const accepted = detail.decisions.find(d => d.result_id === result?.id && d.decision === "accept");
  expect(accepted?.owner_id).toBe(detail.need.owner_id);
  expect(accepted?.need_revision).toBe(detail.need.revision);
});
