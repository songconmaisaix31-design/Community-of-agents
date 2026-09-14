import test from "node:test";
import assert from "node:assert/strict";
import { createBrowserAuth } from "../../lib/gongzhi/browser-auth.ts";
import { ApiClientError } from "../../lib/gongzhi/api-client.ts";

test("cookie BrowserAuth rechecks focus/BFCache/storage, expiry and network failure without holding credentials", async () => {
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window"), oldFetch = globalThis.fetch;
  const events = new EventTarget(), storage = new Map<string, string>();
  let navigated = "", fail = false, signedOut = false, expires = Date.now() + 60_000;
  const fakeWindow = Object.assign(events, { location: { assign: (url: string) => { navigated = url; } }, localStorage: { setItem: (k: string, v: string) => storage.set(k, v) } });
  Object.defineProperty(globalThis, "window", { value: fakeWindow, configurable: true });
  globalThis.fetch = (async (url, init) => {
    assert.equal(init?.credentials, "same-origin"); assert.equal(new Headers(init?.headers).has("authorization"), false);
    if (fail) throw new Error("fixture offline");
    let data: unknown = {};
    if (String(url).endsWith("/session")) data = { user: signedOut ? null : { id: "fixture-user", provider: "zhihu", name: "Fixture", avatar_url: null }, expires_at: signedOut ? null : new Date(expires).toISOString() };
    if (String(url).endsWith("/start")) data = { authorization_url: "https://openapi.zhihu.com/authorize?state=fixture" };
    if (String(url).endsWith("/logout")) { signedOut = true; data = { signed_out: true }; }
    return Response.json({ ok: true, mode: "live", data });
  }) as typeof fetch;
  const auth = createBrowserAuth("live", { available: true, provider: "zhihu", url: null, public_key: null });
  const seen: (string | null)[] = [];
  auth.onChange(user => seen.push(user?.id ?? null));
  const tick = () => new Promise(resolve => setTimeout(resolve, 20));
  try {
    assert.equal((await auth.initialize())?.id, "fixture-user"); assert.equal(auth.getAccessToken(), undefined);
    await auth.startSignIn(); assert.match(navigated, /^https:\/\/openapi.zhihu.com\/authorize/);
    events.dispatchEvent(new Event("pageshow")); await tick(); assert.equal(seen.at(-1), "fixture-user");
    fail = true; events.dispatchEvent(new Event("focus")); await tick(); assert.equal(seen.at(-1), null);
    fail = false; await auth.initialize();
    signedOut = true;
    const event = new Event("storage"); Object.assign(event, { key: "gongzhi.live.auth.changed.v2" }); events.dispatchEvent(event); await tick(); assert.equal(seen.at(-1), null);
    signedOut = false; expires = Date.now() + 30; await auth.initialize(); await new Promise(resolve => setTimeout(resolve, 50)); assert.equal(seen.at(-1), null);
    expires = Date.now() + 60_000; await auth.initialize(); await auth.signOut(); assert.equal(seen.at(-1), null);
    for (const value of storage.values()) assert.ok(!value.includes("fixture-user"));
  } finally { auth.dispose(); globalThis.fetch = oldFetch; if (oldWindow) Object.defineProperty(globalThis, "window", oldWindow); else Reflect.deleteProperty(globalThis, "window"); }
});

test("cookie SDK bounds hung headers/body, coalesces reads and discards start responses after logout/dispose", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window"), oldFetch = globalThis.fetch;
  const events = new EventTarget(); let navigations = 0;
  Object.defineProperty(globalThis, "window", { value: Object.assign(events, { location: { assign() { navigations++; } }, localStorage: { setItem() {} } }), configurable: true });
  const requests: { url: string; signal: AbortSignal; resolve: (r: Response) => void }[] = [];
  globalThis.fetch = ((url, init) => {
    if (String(url).endsWith("/logout")) return Promise.resolve(Response.json({ ok: true, mode: "live", data: { signed_out: true } }));
    return new Promise<Response>(resolve => requests.push({ url: String(url), signal: init!.signal as AbortSignal, resolve }));
  }) as typeof fetch;
  const config = { available: true, provider: "zhihu" as const, url: null, public_key: null };
  const auth = createBrowserAuth("live", config);
  const errorCode = (code: string) => (e: unknown) => e instanceof ApiClientError && e.error.code === code;
  const authorized = () => Response.json({ ok: true, mode: "live", data: { authorization_url: "https://openapi.zhihu.com/authorize" } });
  try {
    const p1 = auth.initialize(), p2 = auth.initialize();
    assert.equal(requests.length, 1, "concurrent refresh shares one request");
    const r1 = assert.rejects(p1, errorCode("unavailable")), r2 = assert.rejects(p2, errorCode("unavailable"));
    const start = assert.rejects(auth.startSignIn(), errorCode("unknown"));
    assert.equal(requests.length, 2);
    t.mock.timers.tick(10_001); await Promise.all([r1, r2, start]);
    assert.ok(requests.every(r => r.signal.aborted)); assert.equal(navigations, 0);
    requests[1].resolve(authorized()); await Promise.resolve(); assert.equal(navigations, 0);
    const bodyRead = assert.rejects(auth.initialize(), errorCode("unavailable"));
    requests[2].resolve(new Response(new ReadableStream()));
    await Promise.resolve(); await Promise.resolve();
    t.mock.timers.tick(10_001); await bodyRead;
    const beforeLogout = assert.rejects(auth.startSignIn(), errorCode("unknown"));
    await auth.signOut(); await beforeLogout; requests[3].resolve(authorized());
    await Promise.resolve(); assert.equal(navigations, 0);
    const beforeDispose = assert.rejects(auth.startSignIn(), errorCode("unknown"));
    auth.dispose(); await beforeDispose; requests[4].resolve(authorized());
    await Promise.resolve(); assert.equal(navigations, 0);
    assert.equal(requests.length, 5, "no write retry after any unknown result");
  } finally { auth.dispose(); t.mock.timers.reset(); globalThis.fetch = oldFetch; if (oldWindow) Object.defineProperty(globalThis, "window", oldWindow); else Reflect.deleteProperty(globalThis, "window"); }
});
