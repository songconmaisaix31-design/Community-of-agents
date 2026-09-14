import { test, expect, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

// Static files only. /zh mappings here do not prove Next routing or deployment.
const root = path.resolve("public/community");
const evidence = path.join(tmpdir(), "gongzhi-evolution-f");
const direct = "/community/zh/evolution/index.html";
let server: Server, origin: string;
const forbidden = new Map<Page, string[]>();
const errors = new Map<Page, string[]>();

test.beforeAll(async () => {
  await mkdir(evidence, { recursive: true });
  server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://localhost");
    let p = decodeURIComponent(url.pathname);
    if (/^\/(api|auth|mcp)(\/|$)/.test(p)) { res.writeHead(503).end("No backend in static test"); return; }
    if (p.startsWith("/community/")) p = p.slice("/community".length);
    if (p.endsWith("/")) p += "index.html";
    const file = path.resolve(root, "." + p);
    if (!file.startsWith(root + path.sep)) { res.writeHead(404).end(); return; }
    try {
      const body = await readFile(file);
      const types: Record<string, string> = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html; charset=utf-8", ".svg": "image/svg+xml", ".gif": "image/gif", ".ttf": "font/ttf", ".woff2": "font/woff2" };
      res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" }); res.end(body);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = "http://127.0.0.1:" + (server.address() as { port: number }).port;
});
test.afterAll(() => server.close());
test.beforeEach(({ page }) => {
  forbidden.set(page, []); errors.set(page, []);
  page.on("request", request => {
    const url = new URL(request.url());
    if (request.method() !== "GET" || /\/(api|auth|mcp)(\/|$)/.test(url.pathname) || (url.origin !== origin && url.protocol !== "blob:" && url.protocol !== "data:")) forbidden.get(page)!.push(request.method() + " " + request.url());
  });
  page.on("websocket", socket => forbidden.get(page)!.push("websocket " + socket.url()));
  page.on("pageerror", error => errors.get(page)!.push(error.message));
});
test.afterEach(({ page }) => {
  expect(forbidden.get(page), "Theory and explicit-demo navigation must issue zero API/auth/MCP/model/external requests or writes").toEqual([]);
  expect(errors.get(page), "No browser runtime error").toEqual([]);
  forbidden.delete(page); errors.delete(page);
});

test("六步操作展示责任与批准边界，静态页面不启动后台客户端", async ({ page }) => {
  const runtimeRequests: string[] = [], failures: string[] = [];
  page.on("request", r => { if (["fetch", "xhr"].includes(r.resourceType())) runtimeRequests.push(r.url()); });
  page.on("response", r => { if (r.status() >= 400) failures.push(r.url()); });
  await page.goto(origin + direct);
  await expect(page).toHaveTitle("Agent 进化层 · 共治");
  await expect(page.getByText("理论设计", { exact: true })).toHaveCount(1);
  await expect(page.locator(".ev-process [role=tab]")).toHaveCount(6);
  await expect(page.locator("script")).toHaveCount(1);
  await expect(page.locator("script")).toHaveAttribute("src", "/community/assets/evolution.js");
  const checks = [
    { owner: "原作者归属独立保留", condition: "可读取不等于可以公开转载", description: "分清原文主张" },
    { owner: "用户确认分享", condition: "接入授权不等于内容同意", description: "A 随后可以离线" },
    { owner: "自己的电脑", condition: "下载不等于执行", description: "准确 ID 与版本" },
    { owner: "用户控制执行边界", condition: "待验证", description: "成功、失败、不适用和未执行" },
    { owner: "用户审阅内容与范围", condition: "反馈需要单独的内容确认", description: "B 可以只保留本地结果" },
    { owner: "用户决定发布", condition: "反馈不会自动覆盖旧版", description: "另存 v2，并保留原 v1" }
  ];
  for (const [i, check] of checks.entries()) {
    await page.locator(`[data-step="${i}"]`).click();
    await expect(page.locator("[data-step-owner]")).toContainText(check.owner);
    await expect(page.locator("[data-step-condition]")).toContainText(check.condition);
    await expect(page.locator("[data-step-description]")).toContainText(check.description);
    await expect(page.locator("[data-step-input]")).not.toBeEmpty();
    await expect(page.locator("[data-step-output]")).not.toBeEmpty();
    await expect(page.locator("#ev-step-panel")).toHaveAttribute("aria-labelledby", `ev-step-${i}`);
  }
  await page.getByRole("button", { name: "回看第一步：经验 →" }).click();
  await expect(page.locator("[data-step='0']")).toHaveAttribute("aria-selected", "true");
  expect(runtimeRequests).toEqual([]); expect(failures).toEqual([]);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(evidence, "evolution-desktop.png"), fullPage: true });
});

test("版本按条件、证据与归属切换，v1固定且v2始终候选", async ({ page }) => {
  await page.goto(origin + direct);
  await page.getByRole("link", { name: "比较版本", exact: true }).click();
  await expect(page).toHaveURL(/#versions$/);
  await expect(page.locator("[data-v1-content]")).toContainText("6 人、室内、60 分钟");
  await expect(page.locator("[data-v2-content]")).toContainText("12 人、户外、30 分钟");
  await page.getByRole("tab", { name: "检查证据", exact: true }).click();
  await expect(page.locator("[data-v1-content]")).toContainText("不声称活动已实际举办");
  await expect(page.locator("[data-v2-content]")).toContainText("待验证");
  await page.getByRole("tab", { name: "来源归属", exact: true }).click();
  await expect(page.locator("[data-v1-content]")).toContainText("原作者、原文链接和使用范围");
  await expect(page.locator("[data-v2-content]")).toContainText("B");
  await expect(page.locator(".ev-version-card").first()).toContainText("固定版本 · 原文保留");
  await expect(page.locator(".ev-candidate")).toContainText("候选改进 · 待审阅");
  await expect(page.locator(".ev-candidate .ev-version-rule")).toContainText("候选内容与公开范围经用户批准后");
  await expect(page.locator(".ev-approval-line")).toContainText("用户审阅内容与范围");
  await page.getByRole("tab", { name: "适用范围", exact: true }).click();
  await expect(page.locator("[data-v1-content]")).toContainText("6 人、室内、60 分钟");
  await expect(page.locator("[data-comparison-note]")).toContainText("不能据此断言 v2 在所有任务上优于 v1");
});

test("键盘跳转、六步与版本维度的焦点顺序可用", async ({ page }) => {
  await page.goto(origin + direct);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "跳到内容" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main$/);
  await page.locator("#ev-step-0").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#ev-step-1")).toBeFocused();
  await expect(page.locator("#ev-step-panel")).toContainText("A 随后可以离线");
  await page.keyboard.press("End");
  await expect(page.locator("#ev-step-5")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator("#ev-step-panel")).toBeFocused();
  await page.keyboard.press("Shift+Tab"); await page.keyboard.press("Home");
  await expect(page.locator("#ev-step-0")).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator("#ev-step-5")).toBeFocused();
  await page.locator("#ev-dimension-scope").focus(); await page.keyboard.press("End");
  await expect(page.locator("#ev-dimension-source")).toBeFocused();
  await expect(page.locator("#ev-comparison")).toHaveAttribute("aria-labelledby", "ev-dimension-source");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#ev-dimension-scope")).toBeFocused();
  expect(await page.locator("#ev-dimension-scope").evaluate(el => getComputedStyle(el).outlineStyle)).toBe("solid");
});

test("390宽手机完整阅读、切换与导航，无横向溢出", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + direct);
  const fits = async () => {
    const dimensions = await page.evaluate(() => ({
      width: innerWidth, scroll: document.documentElement.scrollWidth,
      outside: Array.from(document.querySelectorAll("body *")).map(el => ({ element: el.className, right: el.getBoundingClientRect().right })).filter(el => el.right > innerWidth)
    }));
    expect(dimensions.scroll, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.width);
  };
  await page.screenshot({ path: path.join(evidence, "evolution-mobile.png"), fullPage: true });
  await fits();
  await page.getByRole("button", { name: "打开导航" }).click();
  await expect(page.getByRole("navigation", { name: "移动导航" })).toBeVisible();
  await page.locator("#ev-mobile-nav a").first().focus(); await page.keyboard.press("Escape");
  await expect(page.getByRole("navigation", { name: "移动导航" })).toBeHidden();
  await expect(page.getByRole("button", { name: "打开导航" })).toBeFocused();
  await page.getByRole("link", { name: "查看机制", exact: true }).click();
  await expect(page).toHaveURL(/#mechanism$/);
  await page.locator("#ev-step-4").click();
  await expect(page.locator("#ev-step-panel")).toContainText("若不选择分享，云端不增加反馈记录");
  await fits();
  await page.locator("#ev-step-panel").screenshot({ path: path.join(evidence, "evolution-mobile-feedback.png") });
  for (const label of ["检查证据", "来源归属", "适用范围"]) {
    await page.getByRole("tab", { name: label, exact: true }).click(); await fits();
  }
});

for (const from of ["/zh/", "/zh/board/", "/zh/connect/"]) {
  test(`跨页入口 ${from} 在桌面与手机保持原模式及返回入口`, async ({ page }) => {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(origin + from + "?demo=atlas");
      await expect(page.locator(".atlas-banner")).toBeVisible();
      if (width === 390) await page.locator("#cm-menu-button").click();
      const link = page.getByRole("link", { name: "进化层", exact: true }).filter({ visible: true });
      await link.focus(); await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/community\/zh\/evolution\/index.html\?demo=atlas$/);
      await expect(page.getByText("理论设计", { exact: true })).toHaveCount(1);
      await expect(page.locator(".atlas-banner")).toHaveCount(0);
      await expect(page.locator(".ev-outro a").first()).toHaveAttribute("href", "/zh/?demo=atlas#agents");
      await page.getByRole("link", { name: "查看公告", exact: true }).click();
      await expect(page).toHaveURL(/\/zh\/board\/\?demo=atlas$/);
      await expect(page.locator(".atlas-banner")).toBeVisible();
    }
  });
}

test("原文仅显式外跳，理论交互不存数据或改变live导航模式", async ({ page }) => {
  await page.goto(origin + direct);
  await page.evaluate(() => { localStorage.setItem("evolution-test-existing", "keep"); sessionStorage.setItem("evolution-test-existing", "keep"); });
  const before = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
  const links = page.locator('.ev-references a[target="_blank"]');
  expect(await links.evaluateAll(nodes => nodes.map(n => (n as HTMLAnchorElement).href))).toEqual([
    "https://evomap.ai/zh/wiki/16-gep-protocol", "https://github.com/EvoMap/evolver", "https://github.com/gepa-ai/gepa", "https://agentskills.io/specification"
  ]);
  for (const link of await links.all()) await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  await page.locator("#ev-step-5").click();
  await page.getByRole("tab", { name: "检查证据", exact: true }).click();
  await page.reload();
  expect(await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }))).toEqual(before);
  await expect(page.locator(".ev-header-back")).toHaveAttribute("href", "/zh/#agents");
  await expect(page.getByRole("link", { name: "查看公告", exact: true })).toHaveAttribute("href", "/zh/board/");
  await expect(page.locator("#ev-step-0")).toHaveAttribute("aria-selected", "true");
});
