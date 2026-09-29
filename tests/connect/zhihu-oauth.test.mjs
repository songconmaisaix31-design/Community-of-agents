import test from 'node:test';
import assert from 'node:assert/strict';
import { createZhihuOAuth, ZhihuOAuthError } from '../../lib/gongzhi/zhihu/oauth.ts';

// Injected HTTP responses only; no real authorization, provider call, account or database.
const config = { appId: 'fixture-app', appKey: 'fixture-app-key', redirectUri: 'https://app.example.invalid/auth/zhihu/callback/?fixed=a%20b' };
const signal = () => new AbortController().signal;
const token = { access_token: 'fixture-user-token', token_type: 'Bearer', expires_in: 3600 };
const profile = '{"uid":969570047710216200,"hash_id":"fixture_hash-1","fullname":"测试昵称","avatar_path":"https://picx.zhimg.com/fixture.jpg","email":"private@example.invalid","phone_no":"private","description":"do not retain","extension":true}';
const adapter = (fetch, extra = {}) => createZhihuOAuth({ ...config, fetch, ...extra });
const codeIs = code => error => error instanceof ZhihuOAuthError && error.code === code && error.retryable === false && error.cause === undefined && !error.stack.includes('fixture-app-key') && !JSON.stringify(error).includes('fixture-user-token');

test('authorization URL uses exact configured redirect and state, never app key, scope or PKCE inventions', () => {
  let requests = 0;
  const options = { ...config, fetch: async () => { requests++; throw Error('no request'); } };
  const client = createZhihuOAuth(options);
  options.redirectUri = 'https://changed.invalid/callback';
  const state = 'random-state_+&=/value';
  const url = new URL(client.authorizationUrl(state));
  assert.equal(url.origin + url.pathname, 'https://openapi.zhihu.com/authorize');
  assert.deepEqual(Object.fromEntries(url.searchParams), { redirect_uri: config.redirectUri, app_id: config.appId, response_type: 'code', state });
  assert.equal(url.href.includes(config.appKey), false);
  assert.equal(requests, 0);
});

test('form code exchange uses only app credentials and returned token remains a server result', async () => {
  let requests = 0;
  const client = adapter(async (url, init) => {
    requests++;
    assert.equal(url, 'https://openapi.zhihu.com/access_token');
    assert.equal(init.method, 'POST');
    assert.equal(init.redirect, 'error');
    assert.equal(init.cache, 'no-store');
    assert.equal(init.headers['Content-Type'], 'application/x-www-form-urlencoded');
    assert.equal('Authorization' in init.headers, false);
    assert.deepEqual(Object.fromEntries(new URLSearchParams(init.body)), { app_id: config.appId, app_key: config.appKey, grant_type: 'authorization_code', redirect_uri: config.redirectUri, code: 'fixture+code&=' });
    return Response.json(token);
  });
  assert.deepEqual(await client.exchangeCode('fixture+code&=', signal()), { accessToken: token.access_token, expiresIn: 3600 });
  assert.equal(requests, 1);
});

test('basic /user uses only OAuth Bearer and preserves original int64 despite valid hash subject', async () => {
  const client = adapter(async (url, init) => {
    assert.equal(url, 'https://openapi.zhihu.com/user');
    assert.equal(init.method, 'GET');
    assert.equal(init.body, undefined);
    assert.deepEqual(init.headers, { Authorization: `Bearer ${token.access_token}`, Accept: 'application/json' });
    assert.equal(init.redirect, 'error');
    return new Response(profile);
  });
  const result = await client.readUser(token.access_token, signal());
  assert.deepEqual(result, { subject: 'hash:fixture_hash-1', uid: '969570047710216200', hashId: 'fixture_hash-1', name: '测试昵称', avatarUrl: 'https://picx.zhimg.com/fixture.jpg' });
  for (const excluded of ['email', 'phone_no', 'description', 'extension', 'access_token']) assert.equal(excluded in result, false);
});

test('documented business 20000 accepts usable root and data responses for token and profile', async () => {
  for (const wrap of [data => ({ code: 20000, ...data }), data => ({ code: 20000, data })]) {
    const client = adapter(async url => Response.json(wrap(url.endsWith('/access_token') ? token : { hash_id: 'fixture-hash' })));
    assert.equal((await client.exchangeCode('fixture-code', signal())).expiresIn, 3600);
    assert.deepEqual(await client.readUser(token.access_token, signal()), { subject: 'hash:fixture-hash', uid: null, hashId: 'fixture-hash', name: null, avatarUrl: null });
  }
});

test('missing optional display fields do not invent names; exact uid is fallback subject', async () => {
  for (const raw of ['{"uid":9007199254740993}', '{"uid":9223372036854775807,"hash_id":"","fullname":null,"avatar_path":"javascript:alert(1)"}']) {
    const result = await adapter(async () => new Response(raw)).readUser(token.access_token, signal());
    assert.equal(result.subject, `uid:${result.uid}`);
    assert.equal(result.uid, raw.includes('9223') ? '9223372036854775807' : '9007199254740993');
    assert.equal(result.name, null);
    assert.equal(result.avatarUrl, null);
  }
});

test('uid lexical form and int64 range must be valid even alongside a good hash', async () => {
  for (const raw of ['0', '-1', '1.5', '1e3', '9223372036854775808', '9007199254740991.1', '"01"', '"rounded"', 'true', '{}']) {
    await assert.rejects(adapter(async () => new Response(`{"uid":${raw},"hash_id":"valid-hash"}`)).readUser(token.access_token, signal()), codeIs('invalid_response'));
  }
});

test('HTTP 200 cannot establish an empty identity or treat display name/email as identity', async () => {
  for (const body of [{}, { code: 20000 }, { data: {} }, { fullname: 'User', email: 'user@example.invalid' }, { hash_id: ' ', uid: null }, { hash_id: 'https://untrusted.invalid' }, [], null, { code: 20000, data: 'User' }]) {
    await assert.rejects(adapter(async () => Response.json(body)).readUser(token.access_token, signal()), codeIs('invalid_response'));
  }
});

for (const [status, body, expected] of [
  [200, { code: 404, data: "User don't exist" }, 'unauthorized'],
  [200, { code: 50000, access_token: token.access_token, hash_id: 'ignored' }, 'upstream_failed'],
  [200, { code: 0, hash_id: 'undocumented-success-code' }, 'upstream_failed'],
  [200, { error: 'fixture-user-token' }, 'upstream_failed'],
  [401, {}, 'unauthorized'], [403, {}, 'unauthorized'], [429, {}, 'rate_limited'],
  [500, {}, 'upstream_failed'], [302, {}, 'upstream_failed'],
]) {
  test(`HTTP ${status}/business ${body.code ?? 'none'} fails closed in both requests without retries`, async () => {
    let requests = 0;
    const client = adapter(async () => { requests++; return Response.json(body, { status }); });
    await assert.rejects(client.exchangeCode('fixture-code', signal()), codeIs(expected));
    assert.equal(requests, 1);
    await assert.rejects(client.readUser(token.access_token, signal()), codeIs(expected));
    assert.equal(requests, 2);
  });
}

test('token requires nonempty Bearer and positive losslessly checked finite lifetime', async () => {
  for (const body of [{ ...token, access_token: '' }, { ...token, access_token: 'bad token' }, { ...token, token_type: 'Basic' }, { access_token: token.access_token, token_type: 'Bearer' }, ...[0, -1, 0.5, 'NaN', 'Infinity', '0', null, 9007199254740992].map(expires_in => ({ ...token, expires_in }))]) {
    await assert.rejects(adapter(async () => Response.json(body)).exchangeCode('fixture-code', signal()), codeIs('invalid_response'));
  }
  await assert.rejects(adapter(async () => new Response('{"access_token":"fixture","token_type":"Bearer","expires_in":9007199254740991.1}')).exchangeCode('fixture-code', signal()), codeIs('invalid_response'));
});

test('absent config fails without falling back to any Access Secret or transport', async () => {
  let requests = 0;
  for (const extra of [{ appId: undefined }, { appKey: '' }, { redirectUri: undefined }]) {
    const client = adapter(async () => { requests++; throw Error('must not fetch'); }, extra);
    assert.throws(() => client.authorizationUrl('state'), codeIs('unavailable'));
    await assert.rejects(client.exchangeCode('code', signal()), codeIs('unavailable'));
    await assert.rejects(client.readUser('token', signal()), codeIs('unavailable'));
  }
  assert.equal(requests, 0);
});

test('invalid callback config, state, code, token or timeout never chooses an upstream URL', async () => {
  let requests = 0;
  const fetch = async () => { requests++; throw Error('must not fetch'); };
  for (const redirectUri of ['http://remote.invalid/cb', 'https://user:pass@host.invalid/cb', 'https://host.invalid/cb#fragment', 'https://host.invalid/cb?state=fixed', 'https://host.invalid/cb?authorization_code=fixed', 'file:///local', ' https://host.invalid/cb']) {
    assert.throws(() => adapter(fetch, { redirectUri }).authorizationUrl('state'), codeIs('unavailable'));
  }
  for (const state of ['', 'bad\nstate', 'x'.repeat(1025)]) assert.throws(() => adapter(fetch).authorizationUrl(state), codeIs('invalid_request'));
  await assert.rejects(adapter(fetch).exchangeCode('bad\ncode', signal()), codeIs('invalid_request'));
  await assert.rejects(adapter(fetch).readUser('bad\r\ntoken', signal()), codeIs('invalid_request'));
  for (const timeoutMs of [NaN, Infinity, 0, -1]) assert.throws(() => adapter(fetch, { timeoutMs }), codeIs('unavailable'));
  assert.equal(requests, 0);
});

test('malformed JSON, invalid UTF8 and oversized declared or streamed bodies are rejected', async () => {
  for (const make of [
    () => new Response('<html>fixture error</html>'),
    () => new Response(new Uint8Array([0xff, 0xfe])),
    () => new Response(profile, { headers: { 'Content-Length': '65537' } }),
    () => new Response(' '.repeat(65536) + profile),
  ]) await assert.rejects(adapter(async () => make()).readUser(token.access_token, signal()), codeIs('invalid_response'));
});

test('upstream errors never expose code, app key, token or raw provider error', async () => {
  let requests = 0;
  const client = adapter(async () => { requests++; throw new Error(`fixture-app-key fixture-user-token fixture-code`); });
  await assert.rejects(client.exchangeCode('fixture-code', signal()), error => codeIs('upstream_failed')(error) && !String(error).includes('fixture-code'));
  assert.equal(requests, 1);
});

test('cancel before sending makes no request; mid-flight cancellation aborts injected transport', async () => {
  const stopped = new AbortController(); stopped.abort();
  let requests = 0;
  await assert.rejects(adapter(async () => { requests++; throw Error('no fetch'); }).exchangeCode('code', stopped.signal), codeIs('cancelled'));
  assert.equal(requests, 0);
  const controller = new AbortController();
  let transportSignal;
  const client = adapter(async (_url, init) => { transportSignal = init.signal; controller.abort(); return new Promise(() => {}); });
  await assert.rejects(client.readUser('token', controller.signal), codeIs('cancelled'));
  assert.equal(transportSignal.aborted, true);
});

test('deadline stops never-resolving transport and body; stream reader is cancelled', async () => {
  let transportSignal;
  const client = adapter(async (_url, init) => { transportSignal = init.signal; return new Promise(() => {}); }, { timeoutMs: 15 });
  await assert.rejects(client.exchangeCode('code', signal()), codeIs('timed_out'));
  assert.equal(transportSignal.aborted, true);
  let cancelled = false;
  const bodyClient = adapter(async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{')); }, cancel() { cancelled = true; } })), { timeoutMs: 15 });
  await assert.rejects(bodyClient.readUser('token', signal()), codeIs('timed_out'));
  assert.equal(cancelled, true);
});
