import test from 'node:test';
import assert from 'node:assert/strict';
import { MockLanguageModelV4 } from 'ai/test';
import { executeAssistant } from '../../lib/gongzhi/agent/execute.ts';
import { getAssistantConfig } from '../../lib/gongzhi/agent/config.ts';
import { ZhihuError, createZhihuSearch } from '../../lib/gongzhi/zhihu/search.ts';
import { createAssistantTools } from '../../lib/gongzhi/agent/tools.ts';
import { createRunBudget } from '../../lib/gongzhi/agent/budget.ts';

const emptyUsage = { model_steps: 0, zhihu_queries: 0, input_tokens: null, output_tokens: null };
const input = { need_id: 'synthetic-need', need_revision: 1, idempotency_key: 'synthetic-key' };
const need = { id: input.need_id, revision: 1, mode: 'live', status: 'open', title: 'Synthetic need', body: 'Create a synthetic deliverable', constraints: '', expected_result: 'A paragraph' };
const identity = { owner: { id: 'synthetic-assistant', kind: 'platform_agent' }, user_id: 'synthetic-user' };
const toolCall = (name, payload = {}) => ({ type: 'tool-call', toolCallId: `call-${name}`, toolName: name, input: JSON.stringify(payload) });
const draftCall = (source_ids = []) => toolCall('submitResult', { title: 'Synthetic output', body: 'An output generated for the synthetic need.', source_ids, method_refs: [] });

function modelSteps(steps) {
  let count = 0;
  const model = new MockLanguageModelV4({ doGenerate: async options => {
    const step = steps[count++];
    assert.ok(step, 'SDK exceeded the programmed model steps');
    const content = typeof step === 'function' ? await step(options) : step;
    return { content, finishReason: { unified: content.some(x => x.type === 'tool-call') ? 'tool-calls' : 'stop', raw: undefined }, warnings: [], usage: { inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 20, text: 20, reasoning: undefined } } };
  } });
  return { model, count: () => count };
}

function harness(overrides = {}) {
  let stored;
  let submitted = 0;
  const submittedBodies = [];
  const request = new AbortController();
  const store = {
    async claimRun(_identity, requestInput, deadline_at) {
      if (stored) {
        if (stored.idempotency_key !== requestInput.idempotency_key) throw Error('Synthetic concurrent need conflict');
        return { run: structuredClone(stored), created: false };
      }
      stored = { id: 'synthetic-run', ...input, owner_id: identity.owner.id, status: 'running', deadline_at, result_id: null, error: null, usage: { ...emptyUsage }, mode: 'live', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      return { run: structuredClone(stored), created: true };
    },
    async getRun() { return structuredClone(stored); },
    async finishRun(_identity, _id, patch) {
      if (stored.status === 'running') stored = { ...stored, ...patch };
      return structuredClone(stored);
    },
    async submitRunResult(_identity, _runId, body) {
      assert.equal(stored.status, 'running');
      assert.equal(body.need_id, input.need_id);
      assert.equal(body.need_revision, input.need_revision);
      assert.equal(body.idempotency_key, 'run:synthetic-run');
      submitted++;
      submittedBodies.push(body);
      return { id: 'synthetic-result', ...body, mode: 'live' };
    },
    ...overrides.store,
  };
  const services = {
    async readNeed(_identity, _needId, signal) { assert.ok(signal instanceof AbortSignal); return { need, results: [], decisions: [] }; },
    async findExperience(_identity, _query, signal) { assert.ok(signal instanceof AbortSignal); return []; },
  };
  return { identity, input, signal: request.signal, request, store, services, search: { search: async () => ({ data: { Items: [{ Title: 'Actual synthetic title', AuthorName: 'Actual synthetic author', ContentID: 'source-1', ContentType: 'Article', ContentText: 'Actual synthetic summary', Url: 'https://zhuanlan.zhihu.com/p/1?utm_source=test' }], HasMore: false, SearchHashId: 'synthetic-search' }, retrievedAt: '2026-09-13T00:00:00.000Z', isSummary: true, cached: false }) }, submittedBodies, submitted: () => submitted, stored: () => stored, cancel: () => { stored.status = 'cancelled'; request.abort(); }, ...overrides.options };
}

test('missing any required runtime configuration is unavailable without provider calls', () => {
  assert.throws(() => getAssistantConfig({}), { name: 'AssistantUnavailableError' });
  const configured = { GONGZHI_ASSISTANT_ENABLED: 'true', GONGZHI_MODEL_API_KEY: 'synthetic', GONGZHI_MODEL_ID: 'synthetic-model' };
  for (const key of Object.keys(configured)) {
    assert.throws(() => getAssistantConfig({ ...configured, [key]: '' }), { name: 'AssistantUnavailableError' });
  }
  for (const base of ['http://model.invalid', 'https://user:secret@model.invalid', 'https://model.invalid/?key=secret']) {
    assert.throws(() => getAssistantConfig({ ...configured, GONGZHI_MODEL_BASE_URL: base }), { name: 'AssistantUnavailableError' });
  }
});

const modelConfig = { GONGZHI_ASSISTANT_ENABLED: 'true', GONGZHI_MODEL_API_KEY: 'synthetic', GONGZHI_MODEL_ID: 'synthetic-model' };

test('optional Zhihu absence permits actual SDK experience-only execution with a mock model', async () => {
  // Client construction is offline; the configured provider is never invoked.
  const config = getAssistantConfig(modelConfig);
  assert.equal(config.zhihuAvailable, false);
  const h = harness();
  const experience = { id: 'synthetic-experience', revision: 2, mode: 'live', title: 'Synthetic method', body: 'Synthetic example method.' };
  h.services.findExperience = async () => [experience];
  const refs = [{ experience_id: experience.id, revision: experience.revision, usage: 'Use the method read in this run.' }];
  const provider = modelSteps([options => {
    assert.ok(options.prompt.some(message => message.role === 'system' && message.content.includes('本站未配置知乎检索')));
    return [toolCall('readNeed')];
  }, [toolCall('findExperience', { query: 'method' })], [toolCall('submitResult', { title: 'Synthetic output', body: 'An experience-based output.', source_ids: [], method_refs: refs })]]);
  const result = await executeAssistant({ ...h, ...config, model: provider.model });
  assert.equal(result.status, 'succeeded');
  assert.equal(result.usage.zhihu_queries, 0);
  assert.deepEqual(h.submittedBodies[0].sources, []);
  assert.deepEqual(h.submittedBodies[0].method_refs, refs);
});

test('attempting unconfigured Zhihu still fails the SDK run without a result', async () => {
  const h = harness();
  const provider = modelSteps([[toolCall('readNeed')], [toolCall('searchZhihu', { query: 'required evidence' })]]);
  const result = await executeAssistant({ ...h, ...getAssistantConfig(modelConfig), model: provider.model });
  assert.equal(result.status, 'failed');
  assert.equal(result.error.code, 'unavailable');
  assert.equal(h.submitted(), 0);
  assert.equal(provider.count(), 2);
});

test('removing Zhihu configuration cannot reuse a previously enabled adapter', async () => {
  const enabled = getAssistantConfig({ ...modelConfig, ZHIHU_ACCESS_SECRET: 'synthetic-secret' });
  assert.equal(enabled.zhihuAvailable, true);
  const disabled = getAssistantConfig({ ...modelConfig, ZHIHU_ACCESS_SECRET: '   ' });
  assert.notEqual(disabled.search, enabled.search);
  await assert.rejects(disabled.search.search('test', new AbortController().signal), { code: 'unavailable' });
});

test('actual SDK tool calling reads, searches and submits only server-produced sources', async () => {
  const h = harness();
  const provider = modelSteps([[toolCall('readNeed')], [toolCall('searchZhihu', { query: 'test' })], [draftCall(['source-1'])]]);
  const result = await executeAssistant({ ...h, model: provider.model });
  assert.equal(result.status, 'succeeded');
  assert.equal(result.result_id, 'synthetic-result');
  assert.equal(h.submitted(), 1);
  assert.deepEqual(h.submittedBodies[0].sources, [{ id: 'source-1', kind: 'zhihu', title: 'Actual synthetic title', author: 'Actual synthetic author', url: 'https://zhuanlan.zhihu.com/p/1?utm_source=test', retrieved_at: '2026-09-13T00:00:00.000Z', content_type: 'summary', excerpt: 'Actual synthetic summary' }]);
  assert.equal(provider.count(), 3);
  assert.deepEqual(result.usage, { model_steps: 3, zhihu_queries: 1, input_tokens: 30, output_tokens: 60 });
});

test('same idempotency key never starts another model operation', async () => {
  const h = harness();
  const provider = modelSteps([[toolCall('readNeed')], [draftCall()]]);
  const [first, duplicate] = await Promise.all([executeAssistant({ ...h, model: provider.model }), executeAssistant({ ...h, model: provider.model })]);
  assert.equal(first.status, 'succeeded');
  assert.equal(duplicate.id, first.id);
  assert.equal(provider.count(), 2);
  assert.equal(h.submitted(), 1);
});

test('four actual SDK model steps is a hard ceiling without a prepared result', async () => {
  const h = harness();
  const provider = modelSteps([[toolCall('readNeed')], [toolCall('findExperience', { query: 'a' })], [toolCall('findExperience', { query: 'b' })], [toolCall('findExperience', { query: 'c' })]]);
  const result = await executeAssistant({ ...h, model: provider.model });
  assert.equal(provider.count(), 4);
  assert.equal(result.status, 'failed');
  assert.equal(h.submitted(), 0);
});

test('two unique searches per run; third tool call fails without hitting transport', async () => {
  let searches = 0;
  const h = harness();
  const actualSearch = h.search.search;
  h.search.search = async (...args) => { searches++; return actualSearch(...args); };
  const provider = modelSteps([[toolCall('readNeed')], [toolCall('searchZhihu', { query: 'a' }), { ...toolCall('searchZhihu', { query: 'b' }), toolCallId: 'search-b' }, { ...toolCall('searchZhihu', { query: 'c' }), toolCallId: 'search-c' }]]);
  const result = await executeAssistant({ ...h, model: provider.model });
  assert.equal(searches, 2);
  assert.equal(result.status, 'failed');
  assert.equal(result.error.code, 'budget_exceeded');
  assert.equal(h.submitted(), 0);
});

test('concurrent identical search calls are coalesced and charged once', async () => {
  const h = harness();
  const provider = modelSteps([[toolCall('readNeed')], [toolCall('searchZhihu', { query: 'same' }), { ...toolCall('searchZhihu', { query: 'same' }), toolCallId: 'second' }], [draftCall(['source-1'])]]);
  const result = await executeAssistant({ ...h, model: provider.model });
  assert.equal(result.status, 'succeeded');
  assert.equal(result.usage.zhihu_queries, 1);
});

test('unretrieved source IDs cannot be submitted', async () => {
  const h = harness();
  const provider = modelSteps([[toolCall('readNeed')], [draftCall(['invented-source'])]]);
  const result = await executeAssistant({ ...h, model: provider.model });
  assert.equal(result.status, 'failed');
  assert.equal(h.submitted(), 0);
});

test('empty search may produce an explicitly unsourced result without fake citations', async () => {
  const h = harness();
  h.search.search = async () => ({ data: { Items: [], HasMore: false, SearchHashId: 'synthetic-empty' }, retrievedAt: '2026-09-13T00:00:00.000Z', isSummary: true, cached: false });
  const provider = modelSteps([[toolCall('readNeed')], [toolCall('searchZhihu', { query: 'empty' })], [draftCall()]]);
  const result = await executeAssistant({ ...h, model: provider.model });
  assert.equal(result.status, 'succeeded');
  assert.deepEqual(h.submittedBodies[0].sources, []);
});

test('model is never given an adoption tool', async () => {
  const h = harness();
  let toolNames;
  const provider = modelSteps([options => {
    toolNames = options.tools.map(tool => tool.name).sort();
    return [{ type: 'text', text: 'I cannot accept results.' }];
  }]);
  const result = await executeAssistant({ ...h, model: provider.model });
  assert.equal(result.status, 'failed');
  assert.equal(h.submitted(), 0);
  // Assert outside the provider: a swallowed assertion must not count as the expected run failure.
  assert.deepEqual(toolNames, ['findExperience', 'readNeed', 'readZhihuAnswers', 'searchZhihu', 'submitResult']);
});

const question = 'https://www.zhihu.com/question/123';
const answerItem = { ContentType: 'answer', ContentToken: '9007199254740993', Url: `${question}/answer/9007199254740993?utm_source=fixture`, Summary: 'Actual fixture provider summary; not full text.' };
const answerCall = (offset, url = question) => toolCall('readZhihuAnswers', { question_url: url, ...(offset === undefined ? {} : { offset }) });
const answerResponse = (Items = [answerItem], Paging = { IsEnd: true }) => Response.json({ Code: 0, Data: { Items, Paging } });
const answerAdapter = fetch => createZhihuSearch({ enabled: true, accessSecret: 'isolated-fixture', fetch });

test('actual SDK plus isolated HTTP answer fixture commits only returned summary metadata', async () => {
  const h = harness();
  let requests = 0;
  h.search = answerAdapter(async () => { requests++; return answerResponse(); });
  const provider = modelSteps([[toolCall('readNeed')], [answerCall()], [draftCall([answerItem.ContentToken])]]);
  const result = await executeAssistant({ ...h, model: provider.model });
  assert.equal(result.status, 'succeeded');
  assert.equal(requests, 1);
  assert.equal(result.usage.zhihu_queries, 1);
  assert.deepEqual(h.submittedBodies[0].sources, [{ id: answerItem.ContentToken, kind: 'zhihu', title: '问题下的回答摘要', url: answerItem.Url, excerpt: answerItem.Summary, content_type: 'summary', retrieved_at: h.submittedBodies[0].sources[0].retrieved_at }]);
});

test('empty page can advance only using official lossless cursor within the four model steps', async () => {
  const h = harness();
  const offsets = [];
  h.search = answerAdapter(async url => {
    offsets.push(url.searchParams.get('Offset'));
    return offsets.length === 1 ? new Response('{"Code":0,"Data":{"Items":[],"Paging":{"IsEnd":false,"NextOffset":9007199254740993}}}') : answerResponse();
  });
  const provider = modelSteps([[toolCall('readNeed')], [answerCall()], [answerCall('9007199254740993')], [draftCall([answerItem.ContentToken])]]);
  const result = await executeAssistant({ ...h, model: provider.model });
  assert.equal(result.status, 'succeeded');
  assert.deepEqual(offsets, ['0', '9007199254740993']);
  assert.equal(result.usage.zhihu_queries, 2);
  assert.equal(result.usage.model_steps, 4);
});

test('same answer page deduplicates concurrent calls and charges once', async () => {
  const h = harness();
  let requests = 0;
  h.search = answerAdapter(async () => { requests++; return answerResponse(); });
  const provider = modelSteps([[toolCall('readNeed')], [answerCall(), { ...answerCall(), toolCallId: 'duplicate-page' }], [draftCall([answerItem.ContentToken])]]);
  const result = await executeAssistant({ ...h, model: provider.model });
  assert.equal(result.status, 'succeeded');
  assert.equal(requests, 1);
  assert.equal(result.usage.zhihu_queries, 1);
});

for (const kind of ['missing', 'invented', 'different-question', 'no-first-page']) {
  test(`answers refuse ${kind} cursor without making a later request`, async () => {
    const h = harness();
    let requests = 0;
    h.search = answerAdapter(async () => { requests++; return answerResponse([], kind === 'missing' ? { IsEnd: false } : { IsEnd: false, NextOffset: 7 }); });
    const later = answerCall(kind === 'invented' ? '8' : '7', kind === 'different-question' ? 'https://www.zhihu.com/question/456' : question);
    const provider = modelSteps([[toolCall('readNeed')], ...(kind === 'no-first-page' ? [] : [[answerCall()]]), [later]]);
    const result = await executeAssistant({ ...h, model: provider.model });
    assert.equal(result.status, 'failed');
    assert.equal(requests, kind === 'no-first-page' ? 0 : 1);
    assert.equal(h.submitted(), 0);
  });
}

test('missing next cursor reports incomplete paging while real summaries remain usable', async () => {
  const h = harness();
  h.search = answerAdapter(async () => answerResponse([answerItem], { IsEnd: false }));
  let observedToolOutput;
  const provider = modelSteps([[toolCall('readNeed')], [answerCall()], options => {
    observedToolOutput = JSON.stringify(options.prompt);
    return [toolCall('submitResult', { title: 'Partial evidence', body: 'Only this page was obtained; pagination is incomplete. The proposal is unverified.', source_ids: [answerItem.ContentToken], method_refs: [] })];
  }]);
  const result = await executeAssistant({ ...h, model: provider.model });
  assert.equal(result.status, 'succeeded');
  assert.match(observedToolOutput, /"pagination_incomplete":true/);
  assert.equal(h.submittedBodies[0].sources.length, 1);
});

for (const answersFirst of [false, true]) {
  test(`search and answers share two calls (${answersFirst ? 'answers' : 'search'} first); third transport is blocked`, async () => {
    const h = harness();
    let requests = 0;
    const search = h.search.search;
    const adapter = answerAdapter(async () => { requests++; return answerResponse(); });
    h.search = { questionAnswers: adapter.questionAnswers, search: async (...args) => { requests++; return search(...args); } };
    const first = answersFirst ? answerCall() : toolCall('searchZhihu', { query: 'one' });
    const second = answersFirst ? toolCall('searchZhihu', { query: 'one' }) : answerCall();
    const third = answersFirst ? answerCall(undefined, 'https://www.zhihu.com/question/456') : toolCall('searchZhihu', { query: 'two' });
    const provider = modelSteps([[toolCall('readNeed')], [first], [second, third]]);
    const result = await executeAssistant({ ...h, model: provider.model });
    assert.equal(result.status, 'failed');
    assert.equal(result.error.code, 'budget_exceeded');
    assert.equal(requests, 2);
    assert.equal(result.usage.zhihu_queries, 2);
    assert.equal(h.submitted(), 0);
  });
}

test('answers before reading the task and cached-only citations from another run are refused', async () => {
  let requests = 0;
  const adapter = answerAdapter(async () => { requests++; return answerResponse(); });
  const early = harness();
  const first = await executeAssistant({ ...early, search: adapter, model: modelSteps([[answerCall()]]).model });
  assert.equal(first.status, 'failed');
  assert.equal(requests, 0);
  // Cache has the source, but this new run has not retrieved it through its tool.
  await adapter.questionAnswers(question, new AbortController().signal);
  const later = harness();
  const result = await executeAssistant({ ...later, search: adapter, model: modelSteps([[toolCall('readNeed')], [draftCall([answerItem.ContentToken])]]).model });
  assert.equal(result.status, 'failed');
  assert.equal(later.submitted(), 0);
});

test('unconfigured answers fail the real SDK execution without a result', async () => {
  const h = harness();
  const result = await executeAssistant({ ...h, ...getAssistantConfig(modelConfig), model: modelSteps([[toolCall('readNeed')], [answerCall()]]).model });
  assert.equal(result.status, 'failed');
  assert.equal(result.error.code, 'unavailable');
  assert.equal(h.submitted(), 0);
});

test('answer quota failure remains sticky; even direct later tool attempts cannot switch channel or submit', async () => {
  const budget = createRunBudget({ signal: new AbortController().signal });
  let searches = 0;
  const adapter = answerAdapter(async () => Response.json({ Code: 30001 }));
  const session = createAssistantTools({ run: { id: 'fixture-run', ...input }, budget, assertActive: async () => {}, readNeed: async () => ({ need }), findExperience: async () => [], searchZhihu: async () => { searches++; throw Error('must not run'); }, readZhihuAnswers: adapter.questionAnswers });
  try {
    await session.tools.readNeed.execute({});
    await assert.rejects(session.tools.readZhihuAnswers.execute({ question_url: question }), { code: 'rate_limited' });
    await assert.rejects(session.tools.searchZhihu.execute({ query: 'fallback' }), { code: 'rate_limited' });
    await assert.rejects(session.tools.submitResult.execute({ title: 'Fake', body: 'Fake success', source_ids: [], method_refs: [] }), { code: 'rate_limited' });
    assert.equal(searches, 0);
    assert.equal(session.getDraft(), undefined);
  } finally { budget.dispose(); }
});

test('answer cancellation reaches HTTP and leaves the SDK run cancelled without a receipt', async () => {
  const h = harness();
  h.search = answerAdapter(async (_url, init) => {
    h.request.abort();
    assert.equal(init.signal.aborted, true);
    return answerResponse();
  });
  const result = await executeAssistant({ ...h, model: modelSteps([[toolCall('readNeed')], [answerCall()]]).model });
  assert.equal(result.status, 'cancelled');
  assert.equal(h.submitted(), 0);
});

test('failed search remains failed even if SDK converts it into a tool result', async () => {
  const h = harness();
  h.search.search = async () => { throw new ZhihuError('unauthorized'); };
  const provider = modelSteps([[toolCall('readNeed')], [toolCall('searchZhihu', { query: 'test' })]]);
  const result = await executeAssistant({ ...h, model: provider.model });
  assert.equal(result.status, 'failed');
  assert.equal(h.submitted(), 0);
});

test('disconnect propagates to the provider and does not submit', async () => {
  const h = harness();
  const provider = modelSteps([options => { h.request.abort(); assert.equal(options.abortSignal.aborted, true); throw new Error('Synthetic disconnect'); }]);
  const result = await executeAssistant({ ...h, model: provider.model });
  assert.equal(result.status, 'cancelled');
  assert.equal(h.submitted(), 0);
  assert.equal(provider.count(), 1);
});

test('deadline expires during provider work and reports timeout', async () => {
  let now = 0;
  const h = harness({ options: { now: () => now } });
  const provider = modelSteps([() => { now = 60_001; return [{ type: 'text', text: 'Too late' }]; }]);
  const result = await executeAssistant({ ...h, model: provider.model });
  assert.equal(result.status, 'timed_out');
  assert.equal(h.submitted(), 0);
});

test('response loss during result commit remains unknown and is not resent', async () => {
  const h = harness({ store: { async submitRunResult() { throw Error('Synthetic response lost'); } } });
  const provider = modelSteps([[toolCall('readNeed')], [draftCall()]]);
  const result = await executeAssistant({ ...h, model: provider.model });
  assert.equal(result.status, 'unknown');
  const again = await executeAssistant({ ...h, model: provider.model });
  assert.equal(again.status, 'unknown');
  assert.equal(provider.count(), 2);
});

test('disconnect racing final persistence returns unknown error, preserving recorded success', async () => {
  const h = harness();
  const finish = h.store.finishRun;
  h.store.finishRun = async (...args) => {
    const result = await finish(...args);
    if (args[2].status === 'succeeded') h.request.abort();
    return result;
  };
  const provider = modelSteps([[toolCall('readNeed')], [draftCall()]]);
  await assert.rejects(executeAssistant({ ...h, model: provider.model }), error => error.code === 'unknown' && error.details.recorded_status === 'succeeded');
  assert.equal(h.stored().status, 'succeeded');
  assert.equal(h.submitted(), 1);
});
