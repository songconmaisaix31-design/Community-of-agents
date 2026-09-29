import assert from 'node:assert/strict';
import test from 'node:test';

// These exercise a running Next server, not MSW or an in-memory route substitute.
const base = process.env.GONGZHI_TEST_BASE_URL;
if (base) {
  const url = new URL(base);
  assert.equal(url.protocol, 'http:', 'Integration probes only target local HTTP');
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Only loopback servers are allowed');
  assert.equal(url.username + url.password + url.search + url.hash, '');
}
const skip = base ? false : 'Set GONGZHI_TEST_BASE_URL to an explicitly started localhost Next server';

test('HTTP demo requests fail closed on the real server for every write method', { skip }, async (t) => {
  for (const method of ['GET', 'POST', 'PATCH', 'PUT', 'DELETE']) {
    await t.test(method, async () => {
      const response = await fetch(new URL('/demo/api/needs', base), {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(method === 'GET' ? {} : { body: JSON.stringify({ title: 'integration probe', mode: 'live', owner_id: 'forged' }) }),
        signal: AbortSignal.timeout(10_000),
      });
      assert.equal(response.status, 409);
      const result = await response.json();
      assert.equal(result.ok, false);
      assert.equal(result.mode, 'demo');
      assert.equal(result.error.code, 'mode_mismatch');
      assert.equal(result.error.retryable, false);
      assert.equal('data' in result, false, 'Rejected demo writes cannot return successful records');
    });
  }
});

test('an unhandled demo API cannot escape the demo rejection route', { skip }, async () => {
  const response = await fetch(new URL('/demo/api/__integration_missing_route__', base), { signal: AbortSignal.timeout(10_000) });
  assert.equal(response.status, 409);
  const result = await response.json();
  assert.equal(result.ok, false);
  assert.equal(result.mode, 'demo');
  assert.equal(result.error.code, 'mode_mismatch');
});

test('live health identifies the real service without claiming live verification', { skip }, async () => {
  const response = await fetch(new URL('/api/gongzhi/health', base), { signal: AbortSignal.timeout(10_000) });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'live');
  assert.equal(result.data.service, 'gongzhi');
  assert.equal(result.data.live_verified, false);
});

test('a missing live API is an error, never a demo success', { skip }, async () => {
  const response = await fetch(new URL('/api/gongzhi/__integration_missing_route__', base), { signal: AbortSignal.timeout(10_000) });
  assert.equal(response.ok, false);
  if (response.headers.get('content-type')?.includes('application/json')) {
    const result = await response.json();
    assert.notEqual(result.mode, 'demo');
    assert.notEqual(result.ok, true);
  }
});
