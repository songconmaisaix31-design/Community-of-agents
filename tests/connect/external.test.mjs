import test from 'node:test';
import assert from 'node:assert/strict';
import { createExternalAgent } from '../../examples/agent/client.ts';
import { readInboxOnce } from '../../examples/agent/inbox.ts';

const basic = { apiKey: 'synthetic-agent-key', signal: new AbortController().signal };

test('external client requires an explicit self-hosted origin and bound key', () => {
  for (const baseUrl of ['https://crier.network', 'https://api.crier.network', 'https://example.test/path', 'https://user:password@example.test', 'http://example.test']) {
    assert.throws(() => createExternalAgent({ ...basic, baseUrl }));
  }
  assert.throws(() => createExternalAgent({ ...basic, baseUrl: 'https://example.test', apiKey: '' }));
});

test('external client sends only to configured origin, uses shared shape and no adoption tool', async () => {
  const client = createExternalAgent({ ...basic, baseUrl: 'https://self-hosted.example.test', fetch: async (url, init) => {
    assert.equal(url.href, 'https://self-hosted.example.test/api/gongzhi/needs/synthetic-need');
    assert.equal(init.headers.Authorization, 'Bearer synthetic-agent-key');
    assert.equal(init.redirect, 'error');
    assert.equal(init.signal, basic.signal);
    return Response.json({ ok: true, mode: 'live', data: { need: { id: 'synthetic-need' }, results: [], decisions: [] } });
  } });
  assert.equal((await client.readNeed('synthetic-need')).need.id, 'synthetic-need');
  assert.equal(client.decideResult, undefined);
  assert.equal(client.request, undefined);
});

test('external failures never fall back to demo', async () => {
  const client = createExternalAgent({ ...basic, baseUrl: 'http://localhost:3000', fetch: async () => Response.json({ ok: true, mode: 'demo', data: { need: {} } }) });
  await assert.rejects(client.readNeed('test'), error => error.error.code === 'mode_mismatch');
});

test('inbox last item is saved even when page next_cursor is null; empty page retains it', async () => {
  const saved = [];
  let page = { items: [{ cursor: 'cursor-1' }, { cursor: 'cursor-2' }], next_cursor: null };
  const client = { async readInbox(cursor, limit) { assert.equal(limit, 20); return page; } };
  const first = await readInboxOnce({ client, cursor: 'cursor-0', handle: async () => {}, saveCursor: async value => { saved.push(value); } });
  assert.equal(first.cursor, 'cursor-2');
  assert.deepEqual(saved, ['cursor-1', 'cursor-2']);
  page = { items: [], next_cursor: null };
  const second = await readInboxOnce({ client, cursor: first.cursor, handle: async () => {}, saveCursor: async value => { saved.push(value); } });
  assert.equal(second.cursor, 'cursor-2');
  assert.equal(saved.length, 2);
});

test('inbox handler failure does not advance its cursor', async () => {
  const saved = [];
  const client = { async readInbox() { return { items: [{ cursor: 'cursor-1' }, { cursor: 'cursor-2' }], next_cursor: 'cursor-2' }; } };
  await assert.rejects(readInboxOnce({ client, cursor: 'cursor-0', handle: async item => { if (item.cursor === 'cursor-2') throw Error('Synthetic handler failure'); }, saveCursor: async value => { saved.push(value); } }));
  assert.deepEqual(saved, ['cursor-1']);
});
