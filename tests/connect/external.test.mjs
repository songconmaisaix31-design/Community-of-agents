import test from 'node:test';
import assert from 'node:assert/strict';
import { createExternalAgent } from '../../examples/agent/client.ts';
import { readInboxOnce } from '../../examples/agent/inbox.ts';

const basic = { apiKey: 'synthetic-agent-key', signal: new AbortController().signal };
const resultInput = { need_id: 'need-test', need_revision: 1, title: 'Synthetic', body: 'Synthetic result', subtype: 'result', sources: [], method_refs: [], idempotency_key: 'stable-test-key' };

test('a malformed null response after sending a write remains unknown', async () => {
  const client = createExternalAgent({ ...basic, baseUrl: 'http://localhost:3000', fetch: async () => Response.json(null) });
  await assert.rejects(client.submitResult(resultInput), error => error.error.code === 'unknown');
});

test('success envelopes without an actual record receipt remain unknown and are not retried', async () => {
  for (const data of [{}, [], { id: '' }, { id: 'result-1', mode: 'demo' }]) {
    let calls = 0;
    const client = createExternalAgent({ ...basic, baseUrl: 'http://localhost:3000', fetch: async () => {
      calls++;
      return Response.json({ ok: true, mode: 'live', data });
    } });
    await assert.rejects(client.submitResult(resultInput), error => error.error.code === 'unknown' && !error.error.retryable);
    assert.equal(calls, 1);
  }
});

test('discussion receipts require server provenance and the requested thread', async () => {
  const input = { thread_id: 'thread-1', category: 'reply', body: 'Synthetic reply', idempotency_key: 'reply-1' };
  const receipt = { id: 'reply-1', thread_id: input.thread_id, speaker_id: 'agent-1', owner_id: 'human-1', mode: 'live' };
  for (const data of [{ ...receipt, speaker_id: undefined }, { ...receipt, owner_id: '' }, { ...receipt, thread_id: 'wrong-thread' }]) {
    const client = createExternalAgent({ ...basic, baseUrl: 'http://localhost:3000', fetch: async () => Response.json({ ok: true, mode: 'live', data }) });
    await assert.rejects(client.postReply(input), error => error.error.code === 'unknown');
  }
  const client = createExternalAgent({ ...basic, baseUrl: 'http://localhost:3000', fetch: async () => Response.json({ ok: true, mode: 'live', data: receipt }) });
  assert.deepEqual(await client.postReply(input), receipt);
});

test('result receipts must identify the requested need revision', async () => {
  const receipt = { id: 'result-1', need_id: resultInput.need_id, need_revision: resultInput.need_revision, owner_id: 'agent-1', mode: 'live' };
  for (const data of [{ ...receipt, need_id: 'wrong-need' }, { ...receipt, need_revision: 2 }]) {
    const client = createExternalAgent({ ...basic, baseUrl: 'http://localhost:3000', fetch: async () => Response.json({ ok: true, mode: 'live', data }) });
    await assert.rejects(client.submitResult(resultInput), error => error.error.code === 'unknown');
  }
  const client = createExternalAgent({ ...basic, baseUrl: 'http://localhost:3000', fetch: async () => Response.json({ ok: true, mode: 'live', data: receipt }) });
  assert.deepEqual(await client.submitResult(resultInput), receipt);
});

test('a lost write response is unknown and is never automatically repeated', async () => {
  let calls = 0;
  const client = createExternalAgent({ ...basic, baseUrl: 'https://self-hosted.example.test', fetch: async () => { calls++; throw Error('synthetic connection loss'); } });
  await assert.rejects(client.submitResult(resultInput), error => error.error.code === 'unknown' && error.error.retryable === false);
  assert.equal(calls, 1);
});

test('explicit scope/revocation failures stay failures without fabricated receipts', async () => {
  for (const code of ['forbidden', 'revoked', 'unavailable']) {
    let calls = 0;
    const client = createExternalAgent({ ...basic, baseUrl: 'https://self-hosted.example.test', fetch: async () => {
      calls++;
      return Response.json({ ok: false, mode: 'live', error: { code, message: 'Synthetic refusal', retryable: false } }, { status: code === 'unavailable' ? 503 : 403 });
    } });
    await assert.rejects(client.submitResult(resultInput), error => error.error.code === code);
    assert.equal(calls, 1);
  }
});

test('mutations reject self-reported owner or scope before sending a request', () => {
  const client = createExternalAgent({ ...basic, baseUrl: 'https://self-hosted.example.test', fetch: async () => { throw Error('must not send'); } });
  assert.throws(() => client.submitResult({ ...resultInput, owner_id: 'someone-else' }));
  assert.throws(() => client.createNeed({ title: 'Synthetic', body: 'Synthetic', idempotency_key: 'test', scopes: ['all'] }));
});

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
