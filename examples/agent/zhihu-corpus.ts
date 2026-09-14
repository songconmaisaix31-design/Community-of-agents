import { lstat, mkdir, open, readFile, realpath, rename, rm, truncate } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { ApiClientError } from '../../lib/gongzhi/api-client.ts';
import { createZhihuSearch, ZhihuError, type ZhihuSearchResult } from '../../lib/gongzhi/zhihu/search.ts';
import { questionUrl, type ZhihuAnswerResult } from '../../lib/gongzhi/zhihu/question-answers.ts';
import { sourceUrl } from '../../lib/gongzhi/zhihu/http.ts';
import { readLocalText } from './local-content.ts';

/** User-authorized ceiling for one batch; failures count and there is no reset flag. */
export const ZHIHU_CORPUS_LIMIT = 5000;
const repository = fileURLToPath(new URL('../../', import.meta.url));
const invalid = (message: string) => new ApiClientError({ code: 'invalid_request', message, retryable: false });

export const ZhihuCorpusPlanSchema = z.object({
  batch_id: z.string().trim().min(1).max(100),
  queries: z.array(z.string().trim().min(1).max(500)).max(500).default([]),
  questions: z.array(z.string().trim().min(1).max(1000)).max(500).default([]),
  max_requests: z.number().int().min(1).max(ZHIHU_CORPUS_LIMIT).default(ZHIHU_CORPUS_LIMIT),
  max_pages_per_question: z.number().int().min(1).max(50).default(5),
  // Failed or unresolved items are never retried silently; the operator opts in per resume.
  retry_unresolved: z.boolean().default(false),
}).strict().refine(plan => plan.queries.length + plan.questions.length > 0, { message: '至少需要一个查询或问题。' });

interface Plan { batch_id: string; queries: string[]; questions: string[]; max_requests: number; max_pages_per_question: number; retry_unresolved: boolean }

const ItemStateSchema = z.enum(['pending', 'done', 'failed', 'incomplete']);
const QueryStateSchema = z.object({ query: z.string().min(1), state: ItemStateSchema, error: z.string().nullable(), retrieved_at: z.string().nullable() }).strict();
const QuestionStateSchema = z.object({ url: z.string().min(1), offset: z.string().min(1).max(19), state: ItemStateSchema, error: z.string().nullable(), pages: z.number().int().min(0), truncated: z.boolean() }).strict();
const InflightSchema = z.object({ kind: z.enum(['query', 'question']), index: z.number().int().min(0), reservation: z.number().int().min(1) }).strict();
const CorpusStateSchema = z.object({
  version: z.literal(1), batch_id: z.string().min(1),
  limit: z.number().int().min(1).max(ZHIHU_CORPUS_LIMIT),
  reserved: z.number().int().min(0), settled: z.number().int().min(0), failed: z.number().int().min(0),
  status: z.enum(['running', 'stopped', 'completed', 'budget_exhausted']), stop_reason: z.string().nullable(),
  queries: z.array(QueryStateSchema), questions: z.array(QuestionStateSchema),
  inflight: InflightSchema.nullable(),
  records: z.number().int().min(0), duplicates: z.number().int().min(0), updated_at: z.string(),
}).strict()
  .refine(state => state.settled <= state.reserved && state.failed <= state.settled && state.reserved <= state.limit)
  .refine(state => !state.inflight || (state.inflight.reservation <= state.reserved
    && (state.inflight.kind === 'query' ? state.inflight.index < state.queries.length : state.inflight.index < state.questions.length)));
type CorpusState = z.infer<typeof CorpusStateSchema>;
type QueryState = z.infer<typeof QueryStateSchema>;
type QuestionState = z.infer<typeof QuestionStateSchema>;

const CorpusRecordSchema = z.object({
  id: z.string().min(1), kind: z.literal('zhihu'), title: z.string().min(1),
  author: z.string().optional(), url: z.string().optional(),
  retrieved_at: z.string(), content_type: z.literal('summary'), excerpt: z.string(),
  provenance: z.record(z.string(), z.string()),
}).strict();
type CorpusRecord = z.infer<typeof CorpusRecordSchema>;
const StoredPageSchema = z.object({
  endpoint: z.enum(['zhihu_search', 'question_answers']),
  request: z.record(z.string(), z.string()),
  retrieved_at: z.string(),
  paging: z.object({ IsEnd: z.boolean(), NextOffset: z.string().optional() }).strict().optional(),
  response: z.unknown(),
  records: z.array(CorpusRecordSchema),
}).strict();

// The same content can arrive as a search ContentID and an answer ContentToken, so
// dedupe prefers the validated official content URL, dropping only known tracking
// params and the fragment. Without one, fall back to endpoint + opaque ID. Original
// URL, ID and provenance are always retained; no numeric conversion, no invented links.
const TRACKING_PARAMS = /^(?:utm_[a-z0-9_]+|share_code|share_token|s_r|s_i|s_c)$/i;
function canonicalContentUrl(value: string | undefined) {
  const valid = sourceUrl(value);
  if (!valid) return undefined;
  const url = new URL(valid);
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) url.pathname = url.pathname.slice(0, -1);
  return url.href;
}
const recordKey = (record: Pick<CorpusRecord, 'id' | 'url' | 'provenance'>) => {
  const canonical = canonicalContentUrl(record.url);
  return canonical ? `url:${canonical}` : `id:${record.provenance.endpoint ?? 'unknown'}:${record.id}`;
};

export interface ZhihuCorpusOptions {
  planPath: string; stateDir: string; accessSecret?: string; signal: AbortSignal;
  fetch?: typeof fetch; now?: () => number; sleep?: (ms: number) => Promise<void>;
  minIntervalMs?: number; timeoutMs?: number;
}

const outsideRepository = (path: string) => {
  const from = relative(repository, path);
  return Boolean(from) && (from.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')) || isAbsolute(from));
};

const missing = (error: unknown) => ['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '');

/** Walk to the deepest existing ancestor so a symlinked parent cannot alias the repository. */
async function ensureOutsideRepository(path: string) {
  let current = resolve(path);
  for (;;) {
    try {
      const actual = await realpath(current);
      if (!outsideRepository(actual)) throw invalid('状态目录必须在仓库外；原文与统计不入 Git。');
      return;
    } catch (error) {
      if (error instanceof ApiClientError) throw error;
      if (!missing(error)) throw error;
      const parent = dirname(current);
      if (parent === current) throw invalid('状态目录无法解析。');
      current = parent;
    }
  }
}

/** Realpath of the deepest existing ancestor, so symlinked parents are resolved before trust. */
async function realAncestor(path: string): Promise<string> {
  let current = resolve(path);
  for (;;) {
    try { return await realpath(current); }
    catch (error) {
      if (!missing(error)) throw error;
      const parent = dirname(current);
      if (parent === current) throw invalid('状态目录无法解析。');
      current = parent;
    }
  }
}

/** Any Git worktree, not only this checkout, would put raw text under version control. */
async function ensureOutsideGitWorktree(path: string) {
  let current = resolve(path);
  for (;;) {
    try {
      await lstat(join(current, '.git'));
      throw invalid('状态目录位于某个 Git 工作树内；原文与统计不入 Git，请换到工作树外目录。');
    } catch (error) {
      if (error instanceof ApiClientError) throw error;
      if (!missing(error)) throw error;
    }
    const parent = dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

async function assertRegularFile(path: string) {
  try {
    const info = await lstat(path);
    if (info.isSymbolicLink() || !info.isFile()) throw invalid(`${basename(path)} 必须是普通文件；拒绝符号链接或特殊文件。`);
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    if (!missing(error)) throw error;
  }
}

async function assertPlainDirectory(path: string) {
  try {
    const info = await lstat(path);
    if (info.isSymbolicLink() || !info.isDirectory()) throw invalid(`${basename(path)} 必须是普通目录；拒绝符号链接或特殊文件。`);
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    if (!missing(error)) throw error;
  }
}

/**
 * Minimal exclusivity for one state directory: no scheduler, no cross-process
 * budget merge. An existing lock is never auto-removed, even when its owner
 * looks dead or unreadable: removing it could delete a lock a concurrent
 * invocation just created. The operator confirms no collector is running and
 * deletes the file manually. Only a lock this invocation created is released.
 */
async function acquireLock(stateDir: string) {
  const path = join(stateDir, 'state.lock');
  await assertRegularFile(path);
  try {
    const file = await open(path, 'wx', 0o600);
    try { await file.writeFile(JSON.stringify({ pid: process.pid, started_at: new Date().toISOString() }) + '\n'); }
    catch (error) { await file.close(); await rm(path, { force: true }); throw error; }
    await file.close();
    return async () => { await rm(path, { force: true }); };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    await assertRegularFile(path);
    let owner: unknown;
    try { owner = JSON.parse(await readFile(path, 'utf8')); } catch { owner = undefined; }
    const pid = owner && typeof owner === 'object' ? (owner as { pid?: unknown }).pid : undefined;
    const who = typeof pid === 'number' && Number.isInteger(pid) && pid > 0 ? `记录的进程 ${pid}` : '记录的进程未知';
    throw invalid(`state.lock 已存在（${who}），本工具不会自动删除。请确认该采集进程已退出后，人工删除 ${path} 再运行。`);
  }
}

async function writeJsonDurable(path: string, value: unknown) {
  const temp = `${path}.tmp`;
  await assertRegularFile(temp);
  const file = await open(temp, 'w', 0o600);
  try { await file.writeFile(JSON.stringify(value, null, 2) + '\n'); await file.sync(); } finally { await file.close(); }
  await rename(temp, path);
}

async function appendDurable(path: string, chunk: string) {
  const file = await open(path, 'a', 0o600);
  try { await file.writeFile(chunk); await file.sync(); } finally { await file.close(); }
}

async function writePage(dir: string, name: string, value: unknown) {
  const path = join(dir, name);
  await assertRegularFile(path);
  const file = await open(path, 'wx', 0o600);
  try { await file.writeFile(JSON.stringify(value, null, 2) + '\n'); await file.sync(); } finally { await file.close(); }
}

async function loadState(path: string): Promise<CorpusState | undefined> {
  await assertRegularFile(path);
  let text: string;
  try { text = await readFile(path, 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
  try { return CorpusStateSchema.parse(JSON.parse(text)); }
  catch { throw invalid('state.json 无法解析或已损坏；停止以免重置预算或重复请求。'); }
}

/**
 * Durable records are the only source of truth. A crash can leave a partial tail
 * line; truncate it instead of appending after it, then rebuild the dedupe set.
 * Repair works on BYTES: multi-byte UTF-8 rows make character indexes unsafe,
 * and 0x0A never occurs inside a multi-byte sequence, so the last newline byte
 * is a safe cut. `total` counts complete rows, `keys` unique dedupe keys.
 */
async function loadRecords(path: string) {
  await assertRegularFile(path);
  let buffer: Buffer;
  try { buffer = await readFile(path); }
  catch (error) { if (missing(error)) return { keys: new Set<string>(), total: 0, duplicates: 0 }; throw error; }
  let keep = buffer.length;
  if (keep && buffer[keep - 1] !== 0x0a) {
    keep = buffer.lastIndexOf(0x0a) + 1;
    await truncate(path, keep);
  }
  const lines = buffer.subarray(0, keep).toString('utf8').split('\n');
  lines.pop();
  const keys = new Set<string>();
  let total = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    let record: CorpusRecord;
    try { record = CorpusRecordSchema.parse(JSON.parse(line)); }
    catch { throw invalid('records.jsonl 存在损坏行；停止以免丢失或重复记录。'); }
    total += 1;
    const key = recordKey(record);
    if (!keys.has(key)) keys.add(key);
  }
  return { keys, total, duplicates: total - keys.size };
}

async function appendRecords(path: string, records: CorpusRecord[], seen: Set<string>) {
  const lines: string[] = [];
  let added = 0;
  let duplicates = 0;
  for (const record of records) {
    const key = recordKey(record);
    if (seen.has(key)) { duplicates++; continue; }
    seen.add(key);
    added++;
    lines.push(JSON.stringify(record));
  }
  if (lines.length) await appendDurable(path, lines.join('\n') + '\n');
  return { added, duplicates };
}

const searchRecords = (result: ZhihuSearchResult, query: string): CorpusRecord[] => result.data.Items.map(item => ({
  id: item.ContentID, kind: 'zhihu', title: item.Title,
  ...(item.AuthorName ? { author: item.AuthorName } : {}),
  ...(item.Url ? { url: item.Url } : {}),
  retrieved_at: result.retrievedAt, content_type: 'summary', excerpt: item.ContentText.slice(0, 1000),
  provenance: { endpoint: 'zhihu_search', query },
}));

const answerRecords = (result: ZhihuAnswerResult, url: string, offset: string): CorpusRecord[] => result.data.Items.map(item => ({
  id: item.ContentToken, kind: 'zhihu', title: '问题下的回答摘要', url: item.Url,
  retrieved_at: result.retrievedAt, content_type: 'summary', excerpt: item.Summary.slice(0, 1000),
  provenance: { endpoint: 'question_answers', question_url: url, offset },
}));

const pageName = (reservation: number, endpoint: 'zhihu_search' | 'question_answers') => `${String(reservation).padStart(5, '0')}-${endpoint}.json`;

async function readPlan(path: string, signal: AbortSignal): Promise<Plan> {
  const raw = await readLocalText(path, signal, true);
  let parsed: z.infer<typeof ZhihuCorpusPlanSchema>;
  try { parsed = ZhihuCorpusPlanSchema.parse(JSON.parse(raw)); }
  catch { throw invalid('计划 JSON 必须是本机指定的严格格式：batch_id、queries/questions、可选 max_requests、max_pages_per_question 与 retry_unresolved。'); }
  let questions: string[];
  try { questions = [...new Set(parsed.questions.map(value => questionUrl(value)))]; }
  catch { throw invalid('计划中的问题链接必须是官方 https://zhihu.com/question/<数字> 形式，不要猜测 ID。'); }
  return { ...parsed, queries: [...new Set(parsed.queries)], questions };
}

/**
 * Serial, resumable, read-only batch. Every attempt is reserved durably before the
 * request; failures count against the hard limit; nothing is retried automatically
 * and no cursor is invented. Results stay in the operator's out-of-repository dir.
 */
export async function collectZhihuCorpus(options: ZhihuCorpusOptions) {
  const { signal } = options;
  signal.throwIfAborted();
  const secret = options.accessSecret?.trim();
  if (!secret) throw new ApiClientError({ code: 'unavailable', message: '采集需要本项目只读凭据 ZHIHU_ACCESS_SECRET；未配置即不可用，不读取其他凭据。', retryable: false });
  const plan = await readPlan(options.planPath, signal);
  if (!isAbsolute(options.stateDir)) throw invalid('状态目录必须是绝对路径。');
  const requested = resolve(options.stateDir);
  await ensureOutsideRepository(requested);
  // Trust only the resolved path: a symlinked parent must not smuggle the state
  // directory into another Git worktree after the lexical check.
  const resolvedAncestor = await realAncestor(requested);
  await ensureOutsideRepository(resolvedAncestor);
  await ensureOutsideGitWorktree(resolvedAncestor);
  await mkdir(requested, { recursive: true });
  const stateDir = await realpath(requested);
  if (!outsideRepository(stateDir)) throw invalid('状态目录必须在仓库外；原文与统计不入 Git。');
  await ensureOutsideGitWorktree(stateDir);
  const statePath = join(stateDir, 'state.json');
  const recordsPath = join(stateDir, 'records.jsonl');
  const pagesDir = join(stateDir, 'pages');
  await assertPlainDirectory(pagesDir);
  await mkdir(pagesDir, { recursive: true });
  await assertRegularFile(recordsPath);

  const release = await acquireLock(stateDir);
  try {
    const previous = await loadState(statePath);
    if (previous) {
      if (previous.batch_id !== plan.batch_id) throw invalid('状态目录已有其他 batch_id 的批次；请换目录，不要混用预算。');
      const same = (have: string[], want: string[]) => have.length === want.length && want.every(value => have.includes(value));
      if (!same(previous.queries.map(item => item.query), plan.queries) || !same(previous.questions.map(item => item.url), plan.questions)) {
        throw invalid('计划与已有批次不一致；恢复必须使用同一计划，不能借恢复扩大范围。');
      }
    }
    const limit = Math.min(previous?.limit ?? plan.max_requests, plan.max_requests);
    if (previous && limit < previous.reserved) throw invalid('计划上限低于该批次已用请求数；不能借恢复追溯削减或重置预算。');
    const nowIso = () => new Date(options.now?.() ?? Date.now()).toISOString();
    const state: CorpusState = previous ?? {
      version: 1, batch_id: plan.batch_id, limit,
      reserved: 0, settled: 0, failed: 0, status: 'running', stop_reason: null,
      queries: plan.queries.map(query => ({ query, state: 'pending', error: null, retrieved_at: null })),
      questions: plan.questions.map(url => ({ url, offset: '0', state: 'pending', error: null, pages: 0, truncated: false })),
      inflight: null, records: 0, duplicates: 0, updated_at: nowIso(),
    };
    state.limit = limit;
    const { keys: seen, total, duplicates } = await loadRecords(recordsPath);
    if (previous && total < previous.records) throw invalid('records.jsonl 少于状态已记录数；停止以免重复请求或丢失记录。');
    state.records = seen.size;
    // Cumulative, never reset by a resume: the records file only holds unique
    // rows, so its own duplicate count is zero even after real duplicates.
    state.duplicates = Math.max(state.duplicates, duplicates);

    const writeState = async () => { state.updated_at = nowIso(); await writeJsonDurable(statePath, state); };
    const counts = (items: Array<{ state: string }>) => ({
      done: items.filter(item => item.state === 'done').length,
      pending: items.filter(item => item.state === 'pending').length,
      failed: items.filter(item => item.state === 'failed').length,
    });
    const summarize = () => ({
      batch_id: state.batch_id, state_dir: stateDir, status: state.status, stop_reason: state.stop_reason,
      requests: { limit: state.limit, reserved: state.reserved, settled: state.settled, failed: state.failed, remaining: state.limit - state.reserved },
      records: { total: state.records, duplicates: state.duplicates },
      queries: counts(state.queries),
      questions: {
        ...counts(state.questions),
        incomplete: state.questions.filter(item => item.state === 'incomplete').length,
        truncated: state.questions.filter(item => item.truncated).length,
      },
      note: '仅官方摘要只读；结果保存在仓库外状态目录；获取不是分享批准，不上传、不入库、不发公告。',
    });

    // Recover a page that was durably written before its state transition: no second request.
    const replayInflight = async () => {
      const inflight = state.inflight;
      if (!inflight) return false;
      const endpoint = inflight.kind === 'query' ? 'zhihu_search' : 'question_answers';
      const path = join(pagesDir, pageName(inflight.reservation, endpoint));
      await assertRegularFile(path);
      let raw: string;
      try { raw = await readFile(path, 'utf8'); }
      catch (error) { if (missing(error)) return false; throw error; }
      let page: z.infer<typeof StoredPageSchema>;
      try { page = StoredPageSchema.parse(JSON.parse(raw)); }
      catch { throw invalid('pages 文件损坏；停止以免重复请求。'); }
      const appended = await appendRecords(recordsPath, page.records, seen);
      state.settled += 1;
      state.records = seen.size;
      state.duplicates += appended.duplicates;
      if (inflight.kind === 'query') {
        const query = state.queries[inflight.index];
        if (query && query.state !== 'done') { query.state = 'done'; query.error = null; query.retrieved_at = page.retrieved_at; }
      } else {
        const question = state.questions[inflight.index];
        if (question && question.state !== 'done' && question.state !== 'incomplete') {
          if (!page.paging) throw invalid('pages 文件缺少官方分页信息；停止以免猜测游标。');
          question.pages += 1;
          if (page.paging.IsEnd) { question.state = 'done'; question.error = null; }
          else if (page.paging.NextOffset === undefined) { question.state = 'incomplete'; question.error = 'pagination_incomplete'; }
          else { question.state = 'pending'; question.error = null; question.offset = page.paging.NextOffset; }
        }
      }
      state.inflight = null;
      await writeState();
      return true;
    };

    if (previous?.status === 'completed') return summarize();
    const recovered = await replayInflight();
    if (!recovered && state.inflight) {
      if (!plan.retry_unresolved) {
        state.status = 'stopped';
        state.stop_reason = 'unknown_inflight';
        await writeState();
        return summarize();
      }
      state.inflight = null;
    }
    if (state.queries.some(item => item.state === 'failed') || state.questions.some(item => item.state === 'failed')) {
      if (!plan.retry_unresolved) {
        state.status = 'stopped';
        state.stop_reason = 'previous_failure';
        await writeState();
        return summarize();
      }
      for (const item of [...state.queries, ...state.questions]) if (item.state === 'failed') { item.state = 'pending'; item.error = null; }
    }
    await writeState();

    const client = createZhihuSearch({ accessSecret: secret, enabled: true, fetch: options.fetch, now: options.now, timeoutMs: options.timeoutMs });
    const minInterval = options.minIntervalMs ?? 1000;
    const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve, reject) => {
      const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(new ZhihuError('cancelled')); };
      const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
      signal.addEventListener('abort', abort, { once: true });
    }));
    let lastRequestAt: number | undefined;
    const throttle = async () => {
      if (minInterval <= 0) return;
      const now = options.now?.() ?? Date.now();
      const wait = lastRequestAt === undefined ? 0 : lastRequestAt + minInterval - now;
      if (wait > 0) await sleep(wait);
      lastRequestAt = options.now?.() ?? Date.now();
    };
    const reserve = async () => { state.reserved += 1; await writeState(); return state.reserved; };
    const recordFailure = async (item: { state: string; error: string | null }, error: unknown) => {
      const code = error instanceof ZhihuError ? error.code : 'unknown';
      state.settled += 1;
      state.failed += 1;
      item.state = 'failed';
      item.error = code;
      state.inflight = null;
      await writeState();
      return code;
    };

    let stop: string | null = null;
    for (const [index, query] of state.queries.entries()) {
      if (stop) break;
      if (query.state === 'done') continue;
      if (state.reserved >= state.limit) { stop = 'budget_exhausted'; break; }
      const reservation = await reserve();
      state.inflight = { kind: 'query', index, reservation };
      await writeState();
      await throttle();
      let result: ZhihuSearchResult;
      try { result = await client.search(query.query, signal, 10); }
      catch (error) { stop = await recordFailure(query, error); break; }
      const records = searchRecords(result, query.query);
      await writePage(pagesDir, pageName(reservation, 'zhihu_search'), {
        endpoint: 'zhihu_search', request: { Query: query.query, Count: '10' }, retrieved_at: result.retrievedAt,
        response: result, records,
      });
      const appended = await appendRecords(recordsPath, records, seen);
      state.settled += 1;
      state.records = seen.size;
      state.duplicates += appended.duplicates;
      query.state = 'done';
      query.error = null;
      query.retrieved_at = result.retrievedAt;
      state.inflight = null;
      await writeState();
    }

    for (const [index, question] of state.questions.entries()) {
      if (stop) break;
      if (question.state === 'done' || question.state === 'incomplete') continue;
      while (!stop) {
        if (question.pages >= plan.max_pages_per_question) {
          question.state = 'done';
          question.truncated = true;
          question.error = null;
          await writeState();
          break;
        }
        if (state.reserved >= state.limit) { stop = 'budget_exhausted'; break; }
        const reservation = await reserve();
        state.inflight = { kind: 'question', index, reservation };
        await writeState();
        await throttle();
        const offset = question.offset;
        let result: ZhihuAnswerResult;
        try { result = await client.questionAnswers(question.url, signal, offset, 5); }
        catch (error) { stop = await recordFailure(question, error); break; }
        const records = answerRecords(result, question.url, offset);
        await writePage(pagesDir, pageName(reservation, 'question_answers'), {
          endpoint: 'question_answers', request: { QuestionUrl: question.url, Offset: offset, Limit: '5' }, retrieved_at: result.retrievedAt,
          paging: result.data.Paging, response: result, records,
        });
        const appended = await appendRecords(recordsPath, records, seen);
        state.settled += 1;
        state.records = seen.size;
        state.duplicates += appended.duplicates;
        question.pages += 1;
        const { IsEnd, NextOffset } = result.data.Paging;
        if (IsEnd) { question.state = 'done'; question.error = null; state.inflight = null; await writeState(); break; }
        if (NextOffset === undefined) { question.state = 'incomplete'; question.error = 'pagination_incomplete'; state.inflight = null; await writeState(); break; }
        question.state = 'pending';
        question.error = null;
        question.offset = NextOffset;
        state.inflight = null;
        await writeState();
      }
    }

    if (stop) {
      state.status = stop === 'budget_exhausted' ? 'budget_exhausted' : 'stopped';
      state.stop_reason = stop;
    } else if (state.questions.some(item => item.state === 'incomplete')) {
      state.status = 'stopped';
      state.stop_reason = 'pagination_incomplete';
    } else {
      state.status = 'completed';
      state.stop_reason = null;
    }
    await writeState();
    return summarize();
  } finally { await release(); }
}
