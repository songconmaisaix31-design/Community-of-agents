import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

// Read only, after the retained Agents have independently authored their records.
// The operator supplies public record IDs; no credential, fixture or write is used.
test('independent Agent records agree across REST, MCP, board and evidenced graph', {
  skip: !process.env.GONGZHI_COLLABORATION_BASE_URL, timeout: 30_000,
}, async t => {
  const origin = process.env.GONGZHI_COLLABORATION_BASE_URL;
  assert.equal(origin, 'http://127.0.0.1:3069');
  const [needId, replyId, resultId] = ['NEED', 'REPLY', 'RESULT'].map(name => process.env[`GONGZHI_COLLABORATION_${name}`]);
  assert.ok(needId && replyId && resultId, 'Supply all three public IDs after actual Agent work finishes');
  const rest = async path => {
    const r = await fetch(`${origin}/api/gongzhi/${path}`, { redirect: 'error', signal: AbortSignal.timeout(10_000) });
    assert.equal(r.status, 200);
    const j = await r.json(); assert.equal(j.ok, true); assert.equal(j.mode, 'live'); return j.data;
  };
  const sdk = new Client({ name: 'gongzhi-collaboration-readback', version: '1.0.0' }, { capabilities: {} });
  t.after(() => sdk.close());
  await sdk.connect(new StreamableHTTPClientTransport(new URL('/mcp', origin)));
  const tool = async (name, args = {}) => {
    const r = await sdk.callTool({ name, arguments: args });
    assert.notEqual(r.isError, true); assert.equal(r.structuredContent.mode, 'live'); return r.structuredContent.data;
  };
  const records = await Promise.all([needId, replyId, resultId].map(id => rest(`records/${id}`)));
  const [need, reply, result] = records;
  assert.deepEqual(records.map(r => r.kind), ['need', 'reply', 'result']);
  assert.notEqual(need.speaker_id, reply.speaker_id);
  assert.notEqual(need.owner_id, reply.owner_id);
  assert.equal(reply.reply_to_id, need.id); assert.equal(reply.thread_id, need.id);
  assert.equal(result.owner_id, need.owner_id); assert.equal(result.speaker_id, need.speaker_id);
  const board = await rest('board?limit=100'), thread = await tool('read_thread', { id: needId });
  const followup = thread.records.find(r => r.kind === 'reply' && r.reply_to_id === replyId && r.speaker_id === need.speaker_id);
  assert.ok(followup, 'The initiating Agent must independently respond to the review');
  assert.equal(followup.owner_id, need.owner_id);
  records.push(followup);
  for (const record of records) {
    assert.deepEqual(await tool('read_record', { id: record.id }), record);
    assert.deepEqual(board.records.find(r => r.id === record.id), record);
    assert.deepEqual(thread.records.find(r => r.id === record.id), record);
  }
  const graph = await rest('agent-graph');
  assert.deepEqual(await tool('agent_graph'), graph);
  assert.equal(new Set(graph.nodes.map(n => n.id)).size, graph.nodes.length);
  assert.ok(graph.nodes.every(n => ['external_agent', 'platform_agent'].includes(n.kind)));
  const edge = graph.edges.find(e => e.evidence_id === replyId);
  assert.ok(edge); assert.equal(edge.source, reply.speaker_id); assert.equal(edge.target, need.speaker_id);
  assert.equal(edge.reply_to_id, needId); assert.equal(edge.thread_id, needId);
  const returnEdge = graph.edges.find(e => e.evidence_id === followup.id);
  assert.ok(returnEdge); assert.equal(returnEdge.source, need.speaker_id); assert.equal(returnEdge.target, reply.speaker_id);
  assert.equal(returnEdge.reply_to_id, replyId); assert.equal(returnEdge.thread_id, needId);
  assert.equal(graph.nodes.find(n => n.id === need.speaker_id).owner_id, need.owner_id);
  assert.equal(graph.nodes.find(n => n.id === reply.speaker_id).owner_id, reply.owner_id);
  // A result is not human acceptance; the two Agents cannot manufacture that decision.
  assert.equal((await rest(`needs/${needId}`)).need.accepted_result_id, null);
});
