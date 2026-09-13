import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
const evidence = path.join(tmpdir(), "gongzhi-frontend-evidence");
async function demo(page: Page) { await page.goto("/demo/"); await expect(page.getByTestId("record-story-a")).toBeVisible(); }
async function close(page: Page) { await page.getByRole("button", { name: "关闭面板", exact: true }).click(); }
test("首片：桌面三入口、三故事与截图", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await mkdir(evidence, { recursive: true }); await page.goto("/"); await expect(page.getByRole("heading", { name: "一个人的难题，也许是另一颗星的光。" })).toBeVisible();
  await page.screenshot({ path: path.join(evidence, "landing-desktop.png"), fullPage: true });
  await page.getByRole("link", { name: "探索示例星群" }).click(); await expect(page.getByTestId("record-story-a")).toBeVisible();
  await page.screenshot({ path: path.join(evidence, "space-desktop.png"), fullPage: true });
  await page.getByRole("button", { name: "接入我的 Agent", exact: true }).click(); await page.getByLabel("Agent 名称").fill("我的示例助手"); await page.getByLabel("它能提供哪些帮助？").fill("活动策划，信息整理"); await page.getByRole("button", { name: "建立示例绑定" }).click(); await expect(page.getByText("示例绑定已保存；没有真实连接。")).toBeVisible(); await expect(page.getByText("尚无在线活动记录", { exact: true })).toBeVisible(); await close(page);
  await page.getByRole("button", { name: "发布需求", exact: true }).click(); await page.getByLabel("想完成什么？").fill("新的输入不会假装获得模型回答"); await page.getByLabel("目前遇到了什么困难？").fill("希望组织一场新的 AI 活动，使用不同人数与条件。"); await page.getByLabel("我确认").check(); await page.getByRole("dialog").getByRole("button", { name: "发布需求", exact: true }).click(); await expect(page.getByRole("heading", { name: "新的输入不会假装获得模型回答" })).toBeVisible(); await expect(page.getByText("暂时还没有回应", { exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: "查看示例帮助" })).toHaveCount(0); await close(page);
  await page.getByRole("button", { name: "分享经验", exact: true }).click(); await page.getByLabel("给这个方法起个名字").fill("我的独立方法"); await page.getByLabel("具体步骤与经验").fill("先确认目标，再留下复盘。"); await page.getByLabel("我确认").check(); await page.getByRole("dialog").getByRole("button", { name: "分享经验", exact: true }).click(); await expect(page.getByRole("heading", { name: "我的独立方法" })).toBeVisible(); await expect(page.getByText(/作者经验 · 没有提供外部来源/)).toBeVisible(); await close(page);
  await page.getByTestId("record-story-a").click(); await page.getByRole("button", { name: "查看示例帮助" }).click(); await expect(page.getByRole("heading", { name: "90 分钟，让每个人带走一张自己的作品" })).toBeVisible(); await page.getByRole("button", { name: "采纳这份结果" }).click(); await expect(page.getByText("人类已采纳", { exact: true })).toBeVisible(); await page.screenshot({ path: path.join(evidence, "story-a-accepted.png"), fullPage: true }); await close(page);
  await page.getByTestId("record-story-b").click(); await expect(page.getByText("暂时还没有回应", { exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: "查看示例帮助" })).toHaveCount(0); await close(page);
  await page.getByTestId("record-story-c").click(); await page.getByRole("button", { name: "查看示例帮助" }).click(); await page.getByRole("button", { name: "先做一张共识卡，再开始分工 · v1" }).click(); await expect(page.getByText(/保存，是留作参考；引用/)).toBeVisible(); await expect(page.getByRole("button", { name: "用共识卡 v1 组织一次读书会复盘" })).toBeVisible();
  expect(errors).toEqual([]);
});
test("首片：窄屏三个入口与减弱动态", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ reducedMotion: "reduce" }); await page.goto("/"); await expect(page.getByRole("button", { name: "动态已减弱" })).toBeVisible(); await page.screenshot({ path: path.join(evidence, "landing-mobile.png"), fullPage: true });
  await demo(page); await page.screenshot({ path: path.join(evidence, "space-mobile.png"), fullPage: true });
  for (const name of ["接入我的 Agent", "发布需求", "分享经验"]) { await page.getByRole("button", { name, exact: true }).click(); await expect(page.getByRole("dialog")).toBeVisible(); await close(page); }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
