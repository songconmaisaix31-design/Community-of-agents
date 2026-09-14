import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { generateText, isStepCount } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { createRunBudget } from '../../lib/gongzhi/agent/budget.ts';
import { createExternalAgent } from '../../examples/agent/client.ts';
import { createExternalTools } from '../../examples/agent/tools.ts';

const root = { id: 'synthetic-need', thread_id: 'synthetic-need', reply_to_id: null, kind: 'need', title: 'Synthetic need', body: 'Only a local test', speaker_id: 'synthetic-agent-a', owner_id: 'synthetic-human-a', speaker: { id: 'synthetic-agent-a', kind: 'external_agent' }, need_revision: 2, mode: 'live' };
const reply = { thread_id: root.id, reply_to_id: root.id, category: 'reply', body: 'Synthetic SDK reply', expected_revision: 2 };
const call = (name, value) => ({ type: 'tool-call', toolCallId: `call-${name}`, toolName: name, input: JSON.stringify(value) });
const execution = { toolCallId: 'synthetic', messages: [] };

test('actual AI SDK + localhost HTTP simulator reads board/thread then posts one attributed reply (not live Agents)', async () => {
  const requests = [];
  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      requests.push({ path: req.url, auth: req.headers.authorization, body: chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null });
      const data = req.url.startsWith('/api/gongzhi/board') ? { records: [root], next_cursor: null, mode: 'live' }
        : req.url.startsWith('/api/gongzhi/threads/') ? { thread_id: root.id, records: [root], next_cursor: null, mode: 'live' }
        : { id: 'synthetic-reply', thread_id: root.id, speaker_id: 'synthetic-agent-b', owner_id: 'synthetic-human-b', mode: 'live' };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, mode: 'live', data }));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const budget = createRunBudget({ signal: new AbortController().signal });
  try {
    const client = createExternalAgent({ baseUrl: `http://127.0.0.1:${server.address().port}`, apiKey: 'synthetic-agent-key', signal: budget.signal });
    const session = createExternalTools({ client, budget, requestKey: 'synthetic-task' });
    const plan = [call('discoverBoard', {}), call('readThread', { thread_id: root.id }), call('postReply', reply)];
    let steps = 0;
    const model = new MockLanguageModelV4({ doGenerate: async () => {
      assert.ok(steps < plan.length, 'must stop after the write');
      return { content: [plan[steps++]], finishReason: { unified: 'tool-calls', raw: undefined }, warnings: [], usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } } };
    } });
    const result = await generateText({ model, prompt: 'Synthetic local protocol test, no real LLM', tools: session.tools,
      maxRetries: 0, abortSignal: budget.signal,
      prepareStep: () => { budget.beginModelStep(); return {}; },
      stopWhen: [isStepCount(4), () => session.hasWritten() || Boolean(session.getFailure())],
    });
    assert.equal(session.getFailure(), undefined);
    assert.equal(result.steps.length, 3);
    assert.equal(budget.usage().modelSteps, 3);
    assert.equal(requests.length, 3);
    assert.ok(requests.every(request => request.auth === 'Bearer synthetic-agent-key'));
    assert.deepEqual(requests[2].body, { ...reply, idempotency_key: 'synthetic-task:discussion' });
    assert.equal(session.getReceipt().speaker_id, 'synthetic-agent-b');
    assert.equal(session.getReceipt().owner_id, 'synthetic-human-b');
    assert.equal(session.tools.decideResult, undefined);
    assert.equal(session.tools.registerAgent, undefined);
    assert.equal(session.tools.createAuthorization, undefined);
    await assert.rejects(session.tools.postReply.execute(reply, execution));
    assert.equal(requests.length, 3, 'sole mutation cannot be repeated by the model');
  } finally {
    budget.dispose();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test('unknown write is sticky: no receipt and no later model tool can send another request', async () => {
  const budget = createRunBudget({ signal: new AbortController().signal });
  let calls = 0;
  try {
    const client = createExternalAgent({ baseUrl: 'http://localhost:3000', apiKey: 'synthetic', signal: budget.signal, fetch: async url => {
      calls++;
      if (url.pathname.includes('/threads/')) return Response.json({ ok: true, mode: 'live', data: { thread_id: root.id, records: [root], next_cursor: null, mode: 'live' } });
      throw Error('Synthetic lost response after possible commit');
    } });
    const session = createExternalTools({ client, budget, requestKey: 'synthetic-task' });
    await session.tools.readThread.execute({ thread_id: root.id }, execution);
    await assert.rejects(session.tools.postReply.execute(reply, execution), e => e.error.code === 'unknown');
    await assert.rejects(session.tools.publishNeed.execute({ title: 'Another', body: 'No second write' }, execution));
    assert.equal(session.getReceipt(), undefined);
    assert.equal(calls, 2);
  } finally { budget.dispose(); }
});

test('tools refuse unread revision/target and cancel future HTTP work', async () => {
  for (const variant of ['unread', 'wrong-revision', 'invented-target', 'cancelled']) {
    const controller = new AbortController();
    const budget = createRunBudget({ signal: controller.signal });
    let calls = 0;
    try {
      const client = { readThread: async () => ({ records: [root] }), postReply: async () => { calls++; } };
      const session = createExternalTools({ client, budget, requestKey: 'synthetic-task' });
      if (variant !== 'unread') await session.tools.readThread.execute({ thread_id: root.id }, execution);
      if (variant === 'cancelled') controller.abort();
      await assert.rejects(session.tools.postReply.execute({ ...reply, ...(variant === 'wrong-revision' ? { expected_revision: 1 } : {}), ...(variant === 'invented-target' ? { reply_to_id: 'invented' } : {}) }, execution));
      assert.equal(calls, 0);
      assert.ok(session.getFailure());
    } finally { budget.dispose(); }
  }
});

test('parallel tool calls are refused and the task stays failed', async () => {
  const budget = createRunBudget({ signal: new AbortController().signal });
  let release;
  try {
    const client = { discoverBoard: async () => { await new Promise(resolve => { release = resolve; }); return { records: [] }; } };
    const session = createExternalTools({ client, budget, requestKey: 'synthetic-task' });
    const pending = session.tools.discoverBoard.execute({}, execution);
    await assert.rejects(session.tools.discoverBoard.execute({}, execution));
    release();
    await assert.rejects(pending);
    assert.ok(session.getFailure());
    assert.equal(session.getReceipt(), undefined);
  } finally { budget.dispose(); }
});

test('experience tool cannot ask the model to approve content or alter a host-reviewed payload', async () => {
  const budget = createRunBudget({ signal: new AbortController().signal });
  try {
    const writes = [];
    const client = { publishExperience: async input => { writes.push(input); return { id: 'fixture-receipt' }; } };
    const content = { action: 'publish_experience', payload: { title: 'Approved title', body: 'Approved body', applicability: 'Local CSV', sources: [], tags: [], visibility: 'public', idempotency_key: 'approved-original-key' } };
    const session = createExternalTools({ client, budget, requestKey: 'must-not-replace-approved-key', approvedContent: { approval_id: 'human-approval-id', content } });
    content.payload.body = 'host object later mutated';
    assert.equal(session.tools.publishExperience.inputSchema.safeParse({ approval_id: 'model-approval', body: 'model body' }).success, false);
    assert.equal(session.tools.createContentApproval, undefined);
    await session.tools.publishExperience.execute({}, execution);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].body, 'Approved body');
    assert.equal(writes[0].idempotency_key, 'approved-original-key');
    assert.equal(writes[0].approval_id, 'human-approval-id');
    await assert.rejects(session.tools.publishExperience.execute({}, execution));
    assert.equal(writes.length, 1);
    const denied = createExternalTools({ client, budget, requestKey: 'missing-human-approval' });
    await assert.rejects(denied.tools.publishExperience.execute({}, execution));
    assert.equal(writes.length, 1);
  } finally { budget.dispose(); }
});

test('feedback tool requires a read fixed version and only sends the human-approved execution account', async () => {
  for (const read of [false, true]) {
    const budget = createRunBudget({ signal: new AbortController().signal });
    try {
      const writes = [];
      const payload = { experience_id: 'fixed-id', revision: 2, body: 'Actually checked local output; fixture test only.', usage: 'CSV check', outcome: 'helpful', visibility: 'public', idempotency_key: 'feedback-approved-key' };
      const client = { readExperienceVersion: async () => ({ experience: { id: 'fixed-id', revision: 2 } }), postExperienceFeedback: async input => { writes.push(input); return { id: 'feedback-id' }; } };
      const session = createExternalTools({ client, budget, requestKey: 'session', approvedContent: { approval_id: 'human-feedback-approval', content: { action: 'experience_feedback', payload } } });
      if (read) {
        await session.tools.readExperienceVersion.execute({ id: 'fixed-id', revision: 2 }, execution);
        await session.tools.postExperienceFeedback.execute({}, execution);
        assert.deepEqual(writes, [{ ...payload, approval_id: 'human-feedback-approval' }]);
      } else {
        await assert.rejects(session.tools.postExperienceFeedback.execute({}, execution));
        assert.deepEqual(writes, []);
      }
    } finally { budget.dispose(); }
  }
});

test('result method references must identify fixed versions actually read in the session', async () => {
  for (const revision of [2, 3]) {
    const budget = createRunBudget({ signal: new AbortController().signal });
    try {
      const writes = [];
      const client = { readNeed: async () => ({ need: { id: root.id, revision: 2 } }), readExperienceVersion: async () => ({ experience: { id: 'fixed-id', revision: 2 } }), submitResult: async input => { writes.push(input); return { id: 'result-id' }; } };
      const session = createExternalTools({ client, budget, requestKey: 'method-result' });
      await session.tools.readNeed.execute({ need_id: root.id }, execution);
      await session.tools.readExperienceVersion.execute({ id: 'fixed-id', revision: 2 }, execution);
      const input = { need_id: root.id, need_revision: 2, title: 'Test', body: 'Fixture only', subtype: 'result', method_refs: [{ experience_id: 'fixed-id', revision, usage: 'Applied this version' }] };
      if (revision === 2) { await session.tools.submitResult.execute(input, execution); assert.deepEqual(writes[0].method_refs, input.method_refs); }
      else { await assert.rejects(session.tools.submitResult.execute(input, execution)); assert.deepEqual(writes, []); }
    } finally { budget.dispose(); }
  }
});
