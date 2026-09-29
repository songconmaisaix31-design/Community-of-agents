import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCommand } from '../../examples/agent/commands.ts';

// Isolated local files only: no deployment, credential, model or Zhihu request.
const signal = new AbortController().signal;
const env = {};
const empty = (async function* () {})();
const run = args => runCommand({ args, env, signal, input: empty });

const sourceFile = (sources) => JSON.stringify({ sources });
const source = (overrides = {}) => ({
  id: 'answer-9007199254740993',
  title: 'Fixture source title',
  author: 'Fixture source author',
  url: 'https://www.zhihu.com/question/123/answer/9007199254740993',
  retrieved_at: '2026-09-15T00:00:00.000Z',
  content_type: 'summary',
  excerpt: 'Official provider summary text; fixture only, not real Zhihu content.',
  ...overrides,
});

async function workspace() {
  const dir = await mkdtemp(join(tmpdir(), 'gongzhi-zhihu-method-'));
  const paths = {
    dir,
    source: join(dir, 'source.json'),
    method: join(dir, 'method.md'),
    output: join(dir, 'draft.json'),
    write: (path, text) => writeFile(path, text),
  };
  return paths;
}

test('source JSON plus operator method text becomes a draft that the original check-draft accepts', async () => {
  const space = await workspace();
  try {
    await space.write(space.source, sourceFile([source()]));
    await space.write(space.method, [
      '---', 'title: 整理后的知乎方法', 'applicability: 仅适用于本机 fixture 条件', '---',
      '# 方法', '', '步骤一：读取来源并核对适用条件。', '', '实际检查：本机运行了针对性 fixture 测试；未做真实任务。',
    ].join('\n'));
    const receipt = await run(['draft-zhihu-experience', space.source, space.method, space.output, 'content-key-1']);
    assert.deepEqual(receipt, { draft_saved: true, action: 'publish_experience', sources: 1, redactions: 0, review_required: true, uploaded: false });
    assert.doesNotMatch(JSON.stringify(receipt), /实际检查/);
    const draft = JSON.parse(await readFile(space.output, 'utf8'));
    assert.equal(draft.action, 'publish_experience');
    assert.equal(draft.payload.visibility, 'public');
    assert.equal(draft.payload.idempotency_key, 'content-key-1');
    assert.equal(draft.payload.applicability, '仅适用于本机 fixture 条件');
    assert.equal(draft.payload.title, '整理后的知乎方法');
    assert.match(draft.payload.body, /实际检查/);
    assert.equal('approval_id' in draft.payload, false);
    assert.deepEqual(draft.payload.sources, [{
      id: 'answer-9007199254740993', kind: 'zhihu', title: 'Fixture source title', author: 'Fixture source author',
      url: 'https://www.zhihu.com/question/123/answer/9007199254740993',
      retrieved_at: '2026-09-15T00:00:00.000Z', content_type: 'summary',
      excerpt: 'Official provider summary text; fixture only, not real Zhihu content.',
    }]);
    assert.deepEqual(await run(['check-draft', space.output]), { action: 'publish_experience', valid: true, review_required: true, uploaded: false });
  } finally { await rm(space.dir, { recursive: true, force: true }); }
});

test('source attribution is preserved exactly: no guessed URL, author or content type', async () => {
  const space = await workspace();
  try {
    await space.write(space.source, sourceFile([source({ url: undefined, author: undefined, content_type: 'full_text' })]));
    await space.write(space.method, '# 只有正文的方法整理');
    await run(['draft-zhihu-experience', space.source, space.method, space.output, 'content-key-2']);
    const draft = JSON.parse(await readFile(space.output, 'utf8'));
    assert.deepEqual(draft.payload.sources[0], {
      id: 'answer-9007199254740993', kind: 'zhihu', title: 'Fixture source title',
      retrieved_at: '2026-09-15T00:00:00.000Z', content_type: 'full_text',
      excerpt: 'Official provider summary text; fixture only, not real Zhihu content.',
    });
    assert.equal(draft.payload.title, '只有正文的方法整理');
  } finally { await rm(space.dir, { recursive: true, force: true }); }
});

test('missing, duplicated, oversized or malformed sources are rejected before any output exists', async () => {
  const space = await workspace();
  try {
    await space.write(space.method, '# 方法');
    for (const sources of [[], Array(7).fill(source()), [source(), source()], [source({ id: '' })], [source({ retrieved_at: 'yesterday' })], [source({ excerpt: 'x'.repeat(1001) })], [source({ content_type: 'reference' })]]) {
      await space.write(space.source, sourceFile(sources));
      await assert.rejects(run(['draft-zhihu-experience', space.source, space.method, space.output, 'content-key-3']), e => e.error.code === 'invalid_request');
    }
    await assert.rejects(readFile(space.output));
  } finally { await rm(space.dir, { recursive: true, force: true }); }
});

test('credential-like or whitespace-bearing source ids are rejected while opaque official ids stay verbatim', async () => {
  const space = await workspace();
  try {
    await space.write(space.method, '# 方法');
    for (const id of ['sk-abcdefgh12345678', 'user@example.com', 'has space', 'crier_sk_fixture1234']) {
      await space.write(space.source, sourceFile([source({ id })]));
      await assert.rejects(run(['draft-zhihu-experience', space.source, space.method, space.output, 'content-key-12']), e => e.error.code === 'invalid_request');
    }
    await assert.rejects(readFile(space.output));
    await space.write(space.source, sourceFile([source({ id: '-1234567890123456789' })]));
    await run(['draft-zhihu-experience', space.source, space.method, space.output, 'content-key-12']);
    assert.equal(JSON.parse(await readFile(space.output, 'utf8')).payload.sources[0].id, '-1234567890123456789');
  } finally { await rm(space.dir, { recursive: true, force: true }); }
});

test('unsafe or non-Zhihu source URLs are rejected instead of rewritten', async () => {
  const space = await workspace();
  try {
    await space.write(space.method, '# 方法');
    for (const url of ['https://outside.invalid/x', 'https://www.zhihu.com/question/1?access_token=fixture', 'http://www.zhihu.com/question/1', 'https://user:pass@www.zhihu.com/question/1']) {
      await space.write(space.source, sourceFile([source({ url })]));
      await assert.rejects(run(['draft-zhihu-experience', space.source, space.method, space.output, 'content-key-4']), e => e.error.code === 'invalid_request');
    }
    await assert.rejects(readFile(space.output));
  } finally { await rm(space.dir, { recursive: true, force: true }); }
});

test('known secret forms in the method text and source excerpt are redacted, never published raw', async () => {
  const space = await workspace();
  try {
    await space.write(space.source, sourceFile([source({ excerpt: '联系 fixture-author@example.com 获取上下文。' })]));
    await space.write(space.method, [
      '# 方法', '',
      'Authorization: Bearer fixture-token-value-1234567890', '',
      '本机路径 C:\\Users\\fixture\\private\\notes.md 仅用于检查。',
    ].join('\n'));
    const receipt = await run(['draft-zhihu-experience', space.source, space.method, space.output, 'content-key-5']);
    assert.ok(receipt.redactions >= 3);
    const raw = await readFile(space.output, 'utf8');
    assert.doesNotMatch(raw, /fixture-author@example\.com|fixture-token-value-1234567890|C:\\Users\\fixture/);
    assert.match(raw, /已脱敏/);
  } finally { await rm(space.dir, { recursive: true, force: true }); }
});

test('out-of-bounds method text, request key and previous version are rejected explicitly', async () => {
  const space = await workspace();
  try {
    await space.write(space.source, sourceFile([source()]));
    await space.write(space.method, `# 方法\n\n${'x'.repeat(8001)}`);
    await assert.rejects(run(['draft-zhihu-experience', space.source, space.method, space.output, 'content-key-6']), e => e.error.code === 'invalid_request');
    await space.write(space.method, '# 方法');
    await assert.rejects(run(['draft-zhihu-experience', space.source, space.method, space.output, '']), e => e.error.code === 'invalid_request');
    await assert.rejects(run(['draft-zhihu-experience', space.source, space.method, space.output, 'content-key-6', '']), e => e.error.code === 'invalid_request');
    const receipt = await run(['draft-zhihu-experience', space.source, space.method, space.output, 'content-key-6', 'previous-experience-1']);
    assert.equal(receipt.draft_saved, true);
    assert.equal(JSON.parse(await readFile(space.output, 'utf8')).payload.previous_version_id, 'previous-experience-1');
  } finally { await rm(space.dir, { recursive: true, force: true }); }
});

test('an existing output file is never overwritten and credential-like input names are refused', async () => {
  const space = await workspace();
  try {
    await space.write(space.source, sourceFile([source()]));
    await space.write(space.method, '# 第一版');
    await run(['draft-zhihu-experience', space.source, space.method, space.output, 'content-key-7']);
    const original = await readFile(space.output, 'utf8');
    await space.write(space.method, '# 第二版');
    await assert.rejects(run(['draft-zhihu-experience', space.source, space.method, space.output, 'content-key-8']), e => e.error.code === 'invalid_request');
    assert.equal(await readFile(space.output, 'utf8'), original);
    const secretPath = join(space.dir, 'token-notes.md');
    await space.write(secretPath, '# 不应读取');
    await assert.rejects(run(['draft-zhihu-experience', space.source, secretPath, join(space.dir, 'draft-9.json'), 'content-key-9']), e => e.error.code === 'invalid_request');
    const textSource = join(space.dir, 'source.txt');
    await space.write(textSource, sourceFile([source()]));
    await assert.rejects(run(['draft-zhihu-experience', textSource, space.method, join(space.dir, 'draft-10.json'), 'content-key-10']), e => e.error.code === 'invalid_request');
  } finally { await rm(space.dir, { recursive: true, force: true }); }
});

test('a file larger than the local input bound is refused without partial output', async () => {
  const space = await workspace();
  try {
    await space.write(space.source, sourceFile([source()]));
    await space.write(space.method, `# 方法\n\n${'x'.repeat(70_000)}`);
    await assert.rejects(run(['draft-zhihu-experience', space.source, space.method, space.output, 'content-key-11']), e => e.error.code === 'invalid_request');
    await assert.rejects(readFile(space.output));
  } finally { await rm(space.dir, { recursive: true, force: true }); }
});
