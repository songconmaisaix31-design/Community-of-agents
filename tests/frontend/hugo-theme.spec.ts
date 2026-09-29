import { test, expect } from "@playwright/test";
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdirSync } from "node:fs";
const evidence = path.join(tmpdir(), "gongzhi-evomap-evidence");
mkdirSync(evidence, { recursive: true });

for (const width of [1440, 390]) test('theme keyboard controls, readable surfaces and drafts at ' + width, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  const failed: string[] = [];
  page.on("requestfailed", request => failed.push(request.url()));
  page.on("pageerror", error => failed.push(error.message));
  await page.goto("/demo/space");
  await expect(page.locator("[data-record-id=demo-discussion-b]")).toBeVisible();
  // Product defaults dark independently of OS. Local preference is explicit.
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => document.fonts.check('500 14px Outfit') && document.fonts.check('600 40px Rajdhani'))).toBe(true);
  for (const theme of ["dark", "light"]) {
    if (theme === "light") { await page.locator("[data-theme-toggle]").focus(); await page.keyboard.press("Space"); }
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.locator("body")).toHaveCSS("background-color", theme === "dark" ? "rgb(0, 0, 0)" : "rgb(255, 255, 255)");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const contrasts = await page.evaluate(() => {
      const rgb = (text: string) => (text.match(/[\d.]+/g) || []).map(Number).slice(0, 3);
      const lum = (c: number[]) => c.map(n => { const v = n / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i], 0);
      return [".hero-description", ".entry-caption", ".record-open p", ".record-byline", ".gz-button-primary", ".gz-button-secondary"].map(selector => {
        const el = document.querySelector(selector)!;
        let bg: Element | null = el;
        while (bg && getComputedStyle(bg).backgroundColor === "rgba(0, 0, 0, 0)") bg = bg.parentElement;
        const fg = lum(rgb(getComputedStyle(el).color)), back = lum(rgb(getComputedStyle(bg || document.body).backgroundColor));
        return { selector, ratio: (Math.max(fg, back) + .05) / (Math.min(fg, back) + .05) };
      });
    });
    for (const result of contrasts) expect(result.ratio, result.selector + " text contrast").toBeGreaterThanOrEqual(4.5);
    await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo(0, 0); });
    await page.screenshot({ path: path.join(evidence, 'page-' + width + '-' + theme + '.png'), fullPage: true });
    await page.locator(".entry-actions [data-open-panel=connect]").click();
    await expect(page.getByRole("button", { name: "确认示例授权", exact: true })).toBeDisabled();
    await page.screenshot({ path: path.join(evidence, 'connect-' + width + '-' + theme + '.png') });
    await page.getByRole("button", { name: "关闭面板", exact: true }).click();
    await page.locator(".backup-forms summary").click();
    await page.getByRole("button", { name: "手动发布需求", exact: true }).click();
    if (theme === "dark") await page.getByLabel("想完成什么？").fill("切换主题不会丢掉的草稿");
    else await expect(page.getByLabel("想完成什么？")).toHaveValue("切换主题不会丢掉的草稿");
    await page.screenshot({ path: path.join(evidence, 'form-' + width + '-' + theme + '.png') });
    await page.getByRole("button", { name: "关闭面板", exact: true }).click();
    await page.locator(".backup-forms summary").click();
  }
  await page.locator(".record-open").first().click();
  await expect(page.getByRole("dialog")).toContainText("为纸笔备选补充验收方法");
  await page.getByLabel("公开内容", { exact: true }).fill("浅色主题下的本机示例补充");
  await page.getByLabel("确认公开这条内容").check();
  await page.getByRole("button", { name: "公开提交", exact: true }).click();
  await expect(page.locator(".thread-record").filter({ hasText: "浅色主题下的本机示例补充" })).toHaveCount(1);
  await page.getByRole("button", { name: "关闭面板", exact: true }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator(".bulletin-card").filter({ hasText: "浅色主题下的本机示例补充" })).toHaveCount(1);
  expect(failed).toEqual([]);
});

test("theme persists through demo reset and full mode navigation; live failures stay explicit", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/demo/space");
  await expect(page.locator("[data-record-id=demo-discussion-b]")).toBeVisible();
  await page.locator("[data-theme-toggle]").click();
  await page.getByRole("button", { name: "重置示例", exact: true }).click();
  await page.getByRole("button", { name: "确认重置示例", exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem("gongzhi.preference.theme"))).toBe("light");
  await page.locator(".mode-switch").click();
  await expect(page).toHaveURL(/\/network$/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("heading", { name: "真实公告暂时无法读取" })).toBeVisible();
  await expect(page.locator(".bulletin-card")).toHaveCount(0);
  expect(await page.evaluate(() => navigator.serviceWorker.controller)).toBeNull();
  await page.screenshot({ path: path.join(evidence, "live-error-light.png"), fullPage: true });
  await page.locator("[data-theme-toggle]").focus(); await page.keyboard.press("Enter");
  await page.locator(".entry-actions [data-open-panel=connect]").click();
  await expect(page.getByRole("button", { name: "生成一次性授权", exact: true })).toBeDisabled();
  await expect(page.getByRole("dialog")).toContainText("当前真实接入不可用");
  await page.screenshot({ path: path.join(evidence, "live-disabled-dark.png") });
});

test("theme works with blocked storage and reduced motion; static default shell exists without JavaScript", async ({ browser, request }) => {
  const html = await (await request.get("/")).text();
  expect(html).toContain('data-theme="dark"');
  expect(html.indexOf("/theme.min.")).toBeGreaterThan(0);
  expect(html.indexOf("/theme.min.")).toBeLessThan(html.indexOf('rel="stylesheet"'));
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.addInitScript(() => { Object.defineProperty(window, "localStorage", { get() { throw new DOMException("Blocked", "SecurityError"); } }); });
  await page.goto("/network");
  await page.locator("[data-theme-toggle]").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator(".gz-button-primary").first()).toHaveCSS("transition-duration", "0s");
  await page.locator("[data-theme-toggle]").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await context.close();
  const nojs = await browser.newContext({ javaScriptEnabled: false });
  const shell = await nojs.newPage(); await shell.goto("/");
  await expect(shell.getByRole("heading", { name: "把你的 Agent 带来。" })).toBeVisible();
  await expect(shell.locator(".entry-actions a")).toHaveCount(2);
  await expect(shell.locator(".page-footer")).toContainText("开源与字体许可");
  await expect(shell.locator("[data-theme-toggle]")).toBeHidden();
  await nojs.close();
});
test("mobile navigation reaches board, agents and participation without sticky-header obstruction", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/demo/space");
  await expect(page.locator("[data-record-id=demo-discussion-b]")).toBeVisible();
  for (const [name, id] of [["公告板", "board"], ["Agent 星群", "agents"], ["如何参与", "how-it-works"]]) {
    const link = page.getByRole("navigation", { name: "主导航", exact: true }).getByRole("link", { name, exact: true });
    await expect(link).toBeVisible(); await link.focus(); await page.keyboard.press("Enter");
    const target = await page.locator("#" + id).boundingBox(), header = await page.locator(".site-header").boundingBox();
    expect(target!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
    expect(target!.y).toBeLessThan(700);
  }
  await page.getByRole("navigation", { name: "主导航", exact: true }).getByRole("link", { name: "公告板", exact: true }).click();
  await page.locator(".record-open").first().click(); await expect(page.getByRole("dialog")).toBeVisible();
});
