import test from "node:test";
import assert from "node:assert/strict";
import { handleWebAuth } from "../../lib/gongzhi/web-auth.ts";
import { SESSION_COOKIE, STATE_COOKIE, opaqueCookie, webCookie } from "../../lib/gongzhi/web-session.ts";

test("login rejects cross-origin, oversized chunked JSON, stalled bodies and explicit credentials before database work", async () => {
  const names = ["SITE_URL", "ZHIHU_OAUTH_APP_ID", "ZHIHU_OAUTH_APP_KEY", "ZHIHU_OAUTH_REDIRECT_URI", "GONGZHI_DATABASE_ENABLED", "DATABASE_URL"];
  const saved = names.map(name => [name, process.env[name]] as const);
  const origin = "https://boundary.example.invalid";
  Object.assign(process.env, { SITE_URL: origin, ZHIHU_OAUTH_APP_ID: "fixture", ZHIHU_OAUTH_APP_KEY: "fixture", ZHIHU_OAUTH_REDIRECT_URI: `${origin}/auth/zhihu/callback`, GONGZHI_DATABASE_ENABLED: "true", DATABASE_URL: "postgres://must-not-connect.invalid/test" });
  try {
    for (const action of ["start", "logout"] as const) {
      const cross = await handleWebAuth(new Request(`${origin}/auth`, { method: "POST", headers: { Origin: "https://evil.invalid" }, body: "{}" }), action);
      assert.equal(cross.status, 403);
      let cancelled = false;
      const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode(" ".repeat(1025))); }, cancel() { cancelled = true; } });
      const req = new Request(`${origin}/auth`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: stream, duplex: "half" } as RequestInit);
      const oversized = await handleWebAuth(req, action); assert.equal(oversized.status, 400); assert.equal(cancelled, true);
    }
    const stalled = new Request(`${origin}/auth`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: new ReadableStream(), duplex: "half" } as RequestInit);
    assert.equal((await handleWebAuth(stalled, "start")).status, 400);
    for (const header of ["", "Bearer invalid", "Bearer crier_sk_fixture", "Basic invalid"]) {
      const response = await handleWebAuth(new Request(`${origin}/session`, { headers: { authorization: header, cookie: `${SESSION_COOKIE}=${"a".repeat(43)}` } }), "session");
      assert.equal(response.status, 401);
    }
    assert.equal(opaqueCookie(new Request(origin, { headers: { cookie: `${STATE_COOKIE}=${"a".repeat(43)}; ${STATE_COOKIE}=${"b".repeat(43)}` } }), STATE_COOKIE), null);
    assert.match(webCookie(SESSION_COOKIE, "fixture", 60), /Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=60/);
  } finally { for (const [name, value] of saved) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } }
});
