// Explicit local acceptance setup. It creates a human-authored need and two
// finite grants through the real UI; each Agent must independently register,
// read and write afterwards. No Agent conversation is synthesized here.
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";

const origin = process.env.GONGZHI_TEST_BASE_URL;
const privateRoot = process.env.GONGZHI_ACCEPTANCE_PRIVATE_DIR;
const email = process.env.GONGZHI_TEST_EMAIL;
const password = process.env.GONGZHI_TEST_PASSWORD;
if (!origin || new URL(origin).hostname !== "127.0.0.1" || !privateRoot || !email || !password) {
  throw new Error("Explicit loopback origin, restricted private directory and test account are required");
}
// Refuse to overwrite earlier grants or restart uncertain writes.
await mkdir(resolve(privateRoot));
const receipts = { origin, grants: [] };
const save = () => writeFile(join(privateRoot, "receipts.json"), JSON.stringify(receipts, null, 2), { mode: 0o600 });
let step = "launch";
let page;
const responses = [];
const browser = await chromium.launch({ channel: "chrome", args: ["--disable-background-networking"] });
try {
  page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  page.on("response", response => {
    const url = new URL(response.url());
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) responses.push({ path: url.pathname, status: response.status() });
  });
  step = "real login";
  await page.goto(origin + "/zh/connect");
  await page.locator('[data-cm-account] input[type="password"]').waitFor();
  // Avoid locator action logs containing the supplied password on failure.
  await page.evaluate(({ email, password }) => {
    document.querySelector('[data-cm-account] input[type="email"]').value = email;
    document.querySelector('[data-cm-account] input[type="password"]').value = password;
  }, { email, password });
  step = "submit login";
  await page.getByRole("button", { name: "登录", exact: true }).click();
  step = "login response";
  await page.getByRole("button", { name: "退出登录", exact: true }).waitFor();
  step = "human identity";
  // Give the real owners request time to settle before deciding to bind.
  await page.waitForFunction(() => document.querySelector('[data-cm-account]')?.textContent.includes("发言身份已绑定") || document.querySelector('[data-cm-account] input[type="text"]'));
  if (await page.locator('[data-cm-account] input[type="text"]').count()) {
    await page.locator('[data-cm-account] input[type="text"]').fill("共治本机验收用户");
    await page.getByRole("button", { name: "登记我的身份", exact: true }).click();
  }
  await page.getByText("已登录 · 发言身份已绑定", { exact: true }).waitFor();
  for (const actor of ["agent-a", "agent-b"]) {
    step = "finite grant " + actor;
    for (const scope of actor === "agent-a" ? ["read", "discuss"] : ["read", "discuss", "submit_result"]) {
      await page.locator(`[data-cm-grants] input[value="${scope}"]`).check();
    }
    const responsePromise = page.waitForResponse(r => r.url() === origin + "/api/gongzhi/authorizations" && r.request().method() === "POST");
    await page.getByRole("button", { name: "签发授权", exact: true }).click();
    const response = await responsePromise;
    const issued = await response.json();
    if (!response.ok() || !issued.ok || issued.mode !== "live" || !issued.data.grant_token) throw new Error("Grant not issued");
    const credential = join(privateRoot, actor + ".credential.json");
    const env = [
      `GONGZHI_SELF_HOSTED_URL=${origin}`,
      `GONGZHI_AGENT_GRANT_TOKEN=${issued.data.grant_token}`,
      `GONGZHI_AGENT_CREDENTIAL_FILE=${credential.replaceAll("\\", "/")}`,
    ].join("\n") + "\n";
    await writeFile(join(privateRoot, actor + ".env"), env, { flag: "wx", mode: 0o600 });
    receipts.grants.push({ actor, authorization: issued.data.authorization });
    await save();
    await page.getByRole("button", { name: "收起令牌", exact: true }).click();
  }
  step = "human need publication";
  await page.goto(origin + "/zh/board");
  await page.getByRole("button", { name: "发布求助", exact: true }).click();
  await page.getByPlaceholder("一句话说明你需要什么帮助").fill("本地真实共治服务上线前，还需要哪些最小验收证据？");
  await page.getByPlaceholder("背景、已经试过什么、卡在哪里").fill("本项目已保留 Next/Crier 后端与当前静态前端，并新建独立回环 GoTrue 和 PostgreSQL。请两名真实 Agent 读取本线程与后续回复，各自提出有依据的最小上线核对项，并互相指出遗漏；最后形成一份可执行成果。当前没有正式部署环境、域名或付费模型/知乎配置，因此不能声称公网部署或外部模型已通过。");
  await page.getByPlaceholder("可选：限制条件，如时间、环境、不能用的方案").fill("仅本项目本机验证；不披露凭据，不修改其他服务，不调用收费服务。明确区分真实本机证据、合成测试、未验证的生产环境。");
  const needResponse = page.waitForResponse(r => r.url() === origin + "/api/gongzhi/needs" && r.request().method() === "POST");
  await page.getByRole("button", { name: "公开发布求助", exact: true }).click();
  const response = await needResponse;
  const need = await response.json();
  if (!response.ok() || !need.ok || need.mode !== "live") throw new Error("Need not published");
  receipts.need = need.data;
  await save();
  console.log(JSON.stringify({ ok: true, layer: "real-browser-login-human-need-finite-grants", needId: need.data.id, actors: receipts.grants.map(g => g.actor), agentExecution: "pending independent Agents" }));
} catch {
  const loginError = step === "login response" ? await page.locator(".cm-form-error").allTextContents() : undefined;
  console.error(JSON.stringify({ ok: false, step, responses, loginError, recovery: "Inspect private receipts; do not blindly replay writes" }));
  process.exitCode = 1;
} finally {
  await browser.close();
}
