import { test, expect } from "@playwright/test";

test("real cross-tab sign-out clears the previous human publishing state", async ({ page, context }) => {
  const email = process.env.GONGZHI_TEST_EMAIL;
  const password = process.env.GONGZHI_TEST_PASSWORD;
  expect(Boolean(email && password), "Explicit local test account is required").toBe(true);
  await page.goto("/zh/connect");
  await page.locator('[data-cm-account] input[type="password"]').waitFor();
  await page.evaluate(({ email, password }) => {
    (document.querySelector('[data-cm-account] input[type="email"]') as HTMLInputElement).value = email!;
    (document.querySelector('[data-cm-account] input[type="password"]') as HTMLInputElement).value = password!;
  }, { email, password });
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByText("已登录 · 发言身份已绑定", { exact: true })).toBeVisible();
  const board = await context.newPage();
  await board.goto("/zh/board");
  await expect(board.getByRole("button", { name: "发布求助", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await expect(page.locator('[data-cm-account] input[type="password"]')).toBeVisible();
  await expect.poll(() => board.evaluate(() => Boolean(localStorage.getItem("gongzhi.live.auth.v1")))).toBe(false);
  await expect(board.getByRole("button", { name: "发布求助", exact: true })).toHaveCount(0);
  await expect(board.locator("[data-cm-publish]")).not.toContainText("的身份公开发布");
});

test("reserved human account adopts the independently submitted real result through the page", async ({ page, request }, info) => {
  const email = process.env.GONGZHI_TEST_EMAIL;
  const password = process.env.GONGZHI_TEST_PASSWORD;
  const needId = process.env.GONGZHI_ACCEPTANCE_NEED_ID;
  const resultId = process.env.GONGZHI_ACCEPTANCE_RESULT_ID;
  expect(Boolean(email && password && needId && resultId), "Explicit local test account and actual need/result IDs are required").toBe(true);
  const before = await (await request.get(`/api/gongzhi/needs/${needId}`)).json();
  expect(before.ok).toBe(true);
  expect(before.mode).toBe("live");
  const result = before.data.results.find((r: { id: string }) => r.id === resultId);
  expect(result).toBeTruthy();
  expect(result.need_revision).toBe(before.data.need.revision);
  await page.goto("/zh/connect");
  await page.locator('[data-cm-account] input[type="password"]').waitFor();
  await page.evaluate(({ email, password }) => {
    (document.querySelector('[data-cm-account] input[type="email"]') as HTMLInputElement).value = email!;
    (document.querySelector('[data-cm-account] input[type="password"]') as HTMLInputElement).value = password!;
  }, { email, password });
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByText("已登录 · 发言身份已绑定", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("已登录 · 发言身份已绑定", { exact: true })).toBeVisible();
  await page.goto("/zh/board");
  await expect(page.getByRole("button", { name: "发布求助", exact: true })).toBeVisible();
  await page.locator(`[data-record-id="${needId}"]`).click();
  const card = page.getByRole("dialog").locator(".cm-result").filter({ has: page.getByRole("heading", { name: result.title, exact: true }) });
  await expect(card.locator(".cm-body")).toHaveText(result.body);
  if (before.data.need.status === "accepted") {
    // A rerun may verify the same persisted decision, never select a new result.
    expect(before.data.need.accepted_result_id).toBe(resultId);
  } else {
    const receipt = page.waitForResponse(r => r.request().method() === "POST" && r.url().includes(`/needs/${needId}/decision`));
    await card.getByRole("button", { name: "采纳这份成果", exact: true }).click();
    const response = await receipt;
    expect(response.status()).toBe(200);
    const decision = await response.json();
    expect(decision.ok).toBe(true);
    expect(decision.mode).toBe("live");
  }
  await expect(page.locator(".cm-need-status")).toHaveText("已采纳成果");
  await page.screenshot({ path: info.outputPath("human-role-adoption.png"), fullPage: true });
  const after = await (await request.get(`/api/gongzhi/needs/${needId}`)).json();
  expect(after.data.need.accepted_result_id).toBe(resultId);
  expect(after.data.decisions.filter((d: { result_id: string; decision: string }) => d.result_id === resultId && d.decision === "accept")).toHaveLength(1);
  await page.goto("/zh/connect");
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await expect(page.locator('[data-cm-account] input[type="password"]')).toBeVisible();
});
