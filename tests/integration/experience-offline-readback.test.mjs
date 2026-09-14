import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

// Read only after the actual author and borrower have completed their own work.
// Record agreement does not itself prove an Agent performed the local task.
test('offline author experience and approved borrower feedback agree across public transports', {
  skip: !process.env.GONGZHI_EXPERIENCE_READBACK_URL, timeout: 30_000,
}, async t => {
  const origin = process.env.GONGZHI_EXPERIENCE_READBACK_URL;
  assert.equal(origin, 'http://127.0.0.1:3079');
  const experienceId = process.env.GONGZHI_EXPERIENCE_READBACK_ID;
  const feedbackId = process.env.GONGZHI_EXPERIENCE_READBACK_FEEDBACK;
  assert.ok(experienceId && feedbackId, 'Supply the two actual public receipts before reading');
  const response = path => fetch(`${origin}/api/gongzhi/${path}`, {
    redirect: 'error', signal: AbortSignal.timeout(10_000),
  });
  const rest = async path => {
    const r = await response(path), body = await r.json();
    assert.equal(r.status, 200); assert.equal(body.ok, true); assert.equal(body.mode, 'live');
    return body.data;
  };
  const sdk = new Client({ name: 'gongzhi-experience-readback', version: '1.0.0' }, { capabilities: {} });
  t.after(() => sdk.close());
  await sdk.connect(new StreamableHTTPClientTransport(new URL('/mcp', origin)));
  const tool = async (name, args = {}) => {
    const r = await sdk.callTool({ name, arguments: args });
    assert.notEqual(r.isError, true); assert.equal(r.structuredContent.ok, true);
    assert.equal(r.structuredContent.mode, 'live'); return r.structuredContent.data;
  };
  const [source, feedback] = await Promise.all([experienceId, feedbackId].map(id => rest(`records/${encodeURIComponent(id)}`)));
  assert.equal(source.kind, 'experience'); assert.equal(feedback.kind, 'reply');
  assert.notEqual(source.speaker_id, feedback.speaker_id);
  assert.notEqual(source.owner_id, feedback.owner_id);
  assert.equal(feedback.thread_id, source.id);
  assert.equal(feedback.experience_feedback.experience_id, source.id);
  assert.equal(feedback.experience_feedback.revision, 1);
  assert.ok(feedback.experience_feedback.usage && feedback.body);
  const fixed = await rest(`experiences/${experienceId}/versions/1`);
  assert.equal(fixed.experience.body, source.body);
  assert.equal(fixed.author.id, source.speaker_id); assert.ok(fixed.author.revoked_at);
  assert.equal(fixed.execution, 'caller_local'); assert.equal(fixed.author_presence_required, false);
  assert.ok(fixed.skill_md.includes(source.body));
  assert.deepEqual(await tool('read_experience_version', { id: experienceId, revision: 1 }), fixed);
  const summaries = await tool('search_experience', { q: fixed.experience.title, limit: 5 });
  assert.ok(summaries.items.some(item => item.id === source.id && item.revision === 1));
  assert.ok(summaries.items.every(item => !('body' in item) && item.summary.length <= 280));
  const thread = await tool('read_thread', { id: source.id });
  for (const record of [source, feedback]) {
    assert.deepEqual(await tool('read_record', { id: record.id }), record);
    assert.deepEqual(thread.records.find(item => item.id === record.id), record);
    const board = await rest(`board?limit=100&speaker_id=${record.speaker_id}`);
    assert.deepEqual(board.records.find(item => item.id === record.id), record);
  }
  const graph = await rest('agent-graph');
  assert.deepEqual(await tool('agent_graph'), graph);
  assert.equal(new Set(graph.nodes.map(n => n.id)).size, graph.nodes.length);
  assert.ok(graph.nodes.every(n => ['external_agent', 'platform_agent'].includes(n.kind)));
  assert.ok(!graph.edges.some(e => e.evidence_id === feedback.id || e.reply_to_id === feedback.id));
  const wrong = await response(`experiences/${experienceId}/versions/2`);
  assert.equal((await wrong.json()).error.code, 'revision_conflict');
  const wrongMcp = await sdk.callTool({ name: 'read_experience_version', arguments: { id: experienceId, revision: 2 } });
  assert.equal(wrongMcp.isError, true); assert.equal(wrongMcp.structuredContent.error.code, 'revision_conflict');
  for (const path of ['agents/me', 'content-approvals', `runs?need_id=${source.id}&idempotency_key=readonly-probe`]) {
    assert.equal((await response(path)).status, 401);
  }
});
