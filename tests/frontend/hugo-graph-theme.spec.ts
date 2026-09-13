import { test, expect, type Page } from "@playwright/test";
import type { AgentGraph, BulletinRecord, Owner } from "../../lib/gongzhi/contracts";

// Default: Builder's actual stylesheet/button. A deliberately selected fixture mode
// supports isolated adapter checks; actual checks never fall back to these tokens.
const actualTheme = process.env.GONGZHI_GRAPH_THEME_SOURCE !== "fixture";
const fixtureCSS = `:root,[data-theme="dark"]{--graph-background:#05090e;--graph-agent:#36d9ff;--graph-platform:#50e6a0;--graph-selected:#ffd54a;--graph-link:#8092b0;--graph-link-hover:#ff749b}
[data-theme="light"]{--graph-background:#f5f8fc;--graph-agent:#00677c;--graph-platform:#236838;--graph-selected:#a34000;--graph-link:#495d79;--graph-link-hover:#a51a54}`;
const time = "2026-09-14T00:00:00.000Z";
const owners: Owner[] = ["A", "B", "C"].map((id, i) => ({ id, publisher_id: id, name: `主题测试 Agent ${id}`, kind: i === 1 ? "platform_agent" : "external_agent", capabilities: [], revoked_at: null, last_seen_at: null, created_at: time, mode: "live" }));
const records: BulletinRecord[] = owners.map((speaker, i) => ({ id: `theme-record-${i}`, thread_id: "theme-record-0", reply_to_id: i ? `theme-record-${i - 1}` : null, kind: i ? "reply" : "experience", title: `主题测试记录 ${i}`, body: "仅浏览器 HTTP 模拟，非真实 Agent 执行。", speaker_id: speaker.id, owner_id: `theme-human-${i}`, speaker, need_revision: null, created_at: time, mode: "live" }));

async function setup(page: Page) {
  if (!actualTheme) await page.addInitScript(css => {
    const install = () => {
      if (!document.head) return false;
      const style = document.createElement("style"); style.textContent = css; document.head.append(style);
      document.documentElement.dataset.theme = "dark"; return true;
    };
    if (!install()) { const observer = new MutationObserver(() => { if (install()) observer.disconnect(); }); observer.observe(document, { childList: true, subtree: true }); }
  }, fixtureCSS.replace(/(#[a-f0-9]{6})/g, "$1!important"));
  let more = false;
  const graph = (): AgentGraph => {
    const members = owners.slice(0, more ? 3 : 2);
    return { mode: "live", nodes: [...members, members[0]].map(owner => ({ id: owner.id, kind: owner.kind as "external_agent" | "platform_agent", label: owner.name, owner_id: "theme-human", mode: "live" })), edges: records.slice(1, more ? 3 : 2).map((record, i) => ({ id: `theme-edge-${i}`, source: record.speaker_id, target: records[i].speaker_id, evidence_id: record.id, reply_to_id: records[i].id, thread_id: record.thread_id, mode: "live" })) };
  };
  await page.route("**/api/gongzhi/agent-graph", route => route.fulfill({ json: { ok: true, mode: "live", data: graph() } }));
  await page.route("**/api/gongzhi/board?*", route => route.fulfill({ json: { ok: true, mode: "live", data: { records: records.slice(0, more ? 3 : 2), next_cursor: null, mode: "live" } } }));
  await page.route("**/api/gongzhi/records/*", route => route.fulfill({ json: { ok: true, mode: "live", data: records.find(record => route.request().url().endsWith(record.id)) } }));
  await page.goto("/network");
  await expect(page.locator(".agent-list button")).toHaveCount(2);
  await page.locator(".truth-note p").evaluate(element => { element.textContent = "主题验收：HTTP 模拟记录，不代表真实 Agent 交流。"; });
  return () => { more = true; };
}

async function theme(page: Page, value: "dark" | "light") {
  if (actualTheme) {
    if (await page.locator("html").getAttribute("data-theme") !== value) await page.locator("[data-theme-toggle]").click();
  } else await page.evaluate(value => { document.documentElement.dataset.theme = value; }, value);
  await expect(page.locator("html")).toHaveAttribute("data-theme", value);
  await page.mouse.move(0, 0);
}

async function camera(page: Page) {
  return page.locator(".cosmos-host canvas").evaluate(element => {
    const zoom = (element as HTMLCanvasElement & { __zoom: { x: number; y: number; k: number } }).__zoom;
    return { x: zoom.x, y: zoom.y, k: zoom.k };
  });
}

async function imageState(page: Page) {
  const png = (await page.locator(".cosmos-host canvas").screenshot({ scale: "css" })).toString("base64");
  return page.evaluate(async png => {
    const image = new Image(); image.src = `data:image/png;base64,${png}`; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext("2d")!; context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const style = getComputedStyle(document.documentElement), tokens: Record<string, number[]> = {};
    for (const name of ["background", "agent", "platform", "selected", "link", "link-hover"]) {
      const color = style.getPropertyValue(`--graph-${name}`).trim();
      if (!color || !CSS.supports("color", color)) throw new Error(`Actual CSS missing --graph-${name}`);
      context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1);
      tokens[name] = Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3);
    }
    const distance = (a: number[], b: number[]) => Math.max(...a.map((value, i) => Math.abs(value - b[i])));
    const points: { x: number; y: number; count: number; kind: string }[] = [];
    for (const kind of ["agent", "platform", "selected"]) {
      const mask = new Uint8Array(canvas.width * canvas.height);
      for (let i = 0; i < mask.length; i++) mask[i] = Number(distance(Array.from(data.slice(i * 4, i * 4 + 3)), tokens[kind]) < 12);
      for (let start = 0; start < mask.length; start++) {
        if (!mask[start]) continue;
        const pending = [start]; mask[start] = 0; let x = 0, y = 0, count = 0;
        while (pending.length) {
          const i = pending.pop()!, px = i % canvas.width, py = Math.floor(i / canvas.width); x += px; y += py; count++;
          for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) {
            const nx = px + dx, ny = py + dy, next = ny * canvas.width + nx;
            if (nx >= 0 && nx < canvas.width && ny >= 0 && ny < canvas.height && mask[next]) { mask[next] = 0; pending.push(next); }
          }
        }
        if (count >= 2) points.push({ x: x / count, y: y / count, count, kind });
      }
    }
    const luminance = (rgb: number[]) => rgb.map(value => { const v = value / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
    const background = luminance(tokens.background);
    const contrast = Object.fromEntries(["agent", "platform", "selected", "link", "link-hover"].map(name => {
      const alpha = name === "link" ? 0.7 : 1, color = luminance(tokens[name].map((v, i) => alpha * v + (1 - alpha) * tokens.background[i]));
      return [name, (Math.max(background, color) + 0.05) / (Math.min(background, color) + 0.05)];
    }));
    let linePixels = 0, hoverPixels = 0;
    const isTint = (color: number[], target: number[]) => {
      const vector = target.map((value, i) => value - tokens.background[i]), square = vector.reduce((sum, value) => sum + value * value, 0);
      const alpha = vector.reduce((sum, value, i) => sum + value * (color[i] - tokens.background[i]), 0) / square;
      return alpha > 0.18 && alpha <= 1.1 && distance(color, vector.map((value, i) => value * alpha + tokens.background[i])) < 10;
    };
    for (let i = 0; i < data.length; i += 4) {
      const color = Array.from(data.slice(i, i + 3));
      if (isTint(color, tokens.link)) linePixels++;
      if (isTint(color, tokens["link-hover"])) hoverPixels++;
    }
    // The parent's rounded clipping exposes its own color in corner pixels.
    const backgroundIndex = (10 * canvas.width + Math.floor(canvas.width / 2)) * 4;
    return { points: points.sort((a, b) => a.x - b.x), background: Array.from(data.slice(backgroundIndex, backgroundIndex + 3)), tokens, contrast, linePixels, hoverPixels };
  }, png);
}

for (const width of [1440, 390]) test(`graph ${actualTheme ? "actual CSS" : "injected CSS fixture"}: repeated themes preserve pixels, camera and interactions at ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 1000 });
  await setup(page); await expect(page.getByTestId("agent-canvas")).toHaveAttribute("data-state", "ready");
  await theme(page, "dark");
  const canvas = await page.locator(".cosmos-host canvas").elementHandle();
  const initialCamera = await camera(page);
  await page.getByRole("button", { name: "缩小点图", exact: true }).click();
  const bounds = (await page.locator(".cosmos-host canvas").boundingBox())!;
  await page.mouse.move(bounds.x + 45, bounds.y + 40); await page.mouse.down(); await page.mouse.move(bounds.x + 65, bounds.y + 48, { steps: 5 }); await page.mouse.up();
  const kept = await camera(page); expect(kept).not.toEqual(initialCamera);
  let positions: { x: number; y: number }[] | undefined;
  for (const mode of ["dark", "light", "dark", "light", "dark"] as const) {
    await theme(page, mode);
    const state = await imageState(page);
    expect(state.background).toEqual(state.tokens.background);
    expect(state.points).toHaveLength(2);
    expect(state.points.map(point => point.kind).sort()).toEqual(["agent", "platform"]);
    expect(state.points.every(point => point.count < 150), "Keep points small").toBe(true);
    for (const [token, contrast] of Object.entries(state.contrast)) expect(contrast, `${mode} ${token} visible against canvas`).toBeGreaterThanOrEqual(3);
    expect(state.linePixels, "The actual canvas contains a visible evidence line").toBeGreaterThan(12);
    if (positions) state.points.forEach((point, i) => { expect(Math.abs(point.x - positions![i].x)).toBeLessThan(1); expect(Math.abs(point.y - positions![i].y)).toBeLessThan(1); });
    positions = state.points;
    expect(await camera(page)).toEqual(kept);
    expect(await canvas!.evaluate(element => element.isConnected)).toBe(true);
    await expect(page.locator(".agent-list button")).toHaveCount(2); await expect(page.locator(".communication-list button")).toHaveCount(1);
  }
  const point = (await imageState(page)).points.find(point => point.kind === "agent")!;
  const currentBounds = (await page.locator(".cosmos-host canvas").boundingBox())!;
  await page.mouse.click(currentBounds.x + point.x, currentBounds.y + point.y);
  await expect(page.locator('.agent-list button[aria-pressed="true"]')).toHaveCount(1);
  expect((await imageState(page)).points.some(point => point.kind === "selected")).toBe(true);
  await theme(page, "light"); expect((await imageState(page)).points.some(point => point.kind === "selected")).toBe(true);
  await page.getByRole("button", { name: "查看全部 Agent 的记录 ×" }).click();
  for (const mode of ["dark", "light"] as const) {
    await theme(page, mode);
    const points = (await imageState(page)).points, box = (await page.locator(".cosmos-host canvas").boundingBox())!;
    await page.mouse.move(box.x + (points[0].x + points[1].x) / 2, box.y + (points[0].y + points[1].y) / 2);
    await expect(page.locator(".graph-tooltip")).toContainText("公开交流");
    expect((await imageState(page)).hoverPixels).toBeGreaterThan(12);
    expect(await camera(page)).toEqual(kept);
  }
  await page.mouse.down(); await page.mouse.up();
  await expect(page.locator("[data-evidence-record=theme-record-0]")).toBeVisible(); await expect(page.locator("[data-evidence-record=theme-record-1]")).toBeVisible();
  await page.getByRole("button", { name: "关闭面板", exact: true }).click();
  await page.locator('.agent-list [data-agent-id="B"]').focus(); await page.keyboard.press("Enter");
  await expect(page.locator('.agent-list [data-agent-id="B"]')).toHaveAttribute("aria-pressed", "true");
  expect(await camera(page)).toEqual(kept);
  await info.attach(`graph-${width}-${actualTheme ? "actual" : "fixture"}`, { body: await page.locator(".cosmos-host canvas").screenshot(), contentType: "image/png" });
});

test("refresh and additional points/edges retain the existing canvas and transformed camera", async ({ page }) => {
  const add = await setup(page); await expect(page.getByTestId("agent-canvas")).toHaveAttribute("data-state", "ready");
  await theme(page, "dark"); const canvas = await page.locator(".cosmos-host canvas").elementHandle();
  // Leave room for a new node without asking the product to fit or move the camera.
  for (let i = 0; i < 6; i++) await page.getByRole("button", { name: "缩小点图", exact: true }).click();
  const box = (await page.locator(".cosmos-host canvas").boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + 40); await page.mouse.down(); await page.mouse.move(box.x + 55, box.y + 45, { steps: 4 }); await page.mouse.up();
  const kept = await camera(page);
  await page.getByRole("button", { name: "刷新公开记录", exact: true }).click();
  await expect(page.locator(".bulletin-card")).toHaveCount(2); expect(await camera(page)).toEqual(kept);
  add(); await page.getByRole("button", { name: "刷新公开记录", exact: true }).click();
  await expect(page.locator(".agent-list button")).toHaveCount(3); await expect(page.locator(".communication-list button")).toHaveCount(2);
  expect(await camera(page)).toEqual(kept); expect(await canvas!.evaluate(element => element.isConnected)).toBe(true);
  await theme(page, "light"); const light = await imageState(page); expect(light.points).toHaveLength(3);
  await theme(page, "dark"); const dark = await imageState(page); expect(dark.points).toHaveLength(3);
  light.points.forEach((point, i) => { expect(Math.abs(point.x - dark.points[i].x)).toBeLessThan(1); expect(Math.abs(point.y - dark.points[i].y)).toBeLessThan(1); });
  expect(await camera(page)).toEqual(kept);
});

test("theme changes preserve keyboard Agent/evidence alternatives without WebGL", async ({ page }) => {
  await page.addInitScript(() => { const original = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...args: unknown[]) { return /webgl/.test(kind) ? null : Reflect.apply(original, this, [kind, ...args]); } as typeof original; });
  await setup(page); await expect(page.getByTestId("agent-canvas")).toHaveAttribute("data-state", "unavailable");
  await theme(page, "light"); await theme(page, "dark");
  await page.locator('.agent-list [data-agent-id="A"]').focus(); await page.keyboard.press("Enter");
  await expect(page.locator('.agent-list [data-agent-id="A"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".bulletin-card")).toHaveCount(1);
  await page.locator(".communication-list summary").focus(); await page.keyboard.press("Enter");
  await page.locator(".communication-list button").focus(); await page.keyboard.press("Enter");
  await expect(page.locator("[data-evidence-record=theme-record-0]")).toBeVisible(); await expect(page.locator("[data-evidence-record=theme-record-1]")).toBeVisible();
});
