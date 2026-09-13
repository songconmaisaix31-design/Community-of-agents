import { addAbortSignal } from 'node:stream';
import { ApiClientError } from '../../lib/gongzhi/api-client.ts';
import { runCommand } from './commands.ts';

const controller = new AbortController();
const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(60_000)]);
const cancel = () => controller.abort();
process.once('SIGINT', cancel);
process.once('SIGTERM', cancel);
// stdin can be aborted while a network read is active and no iterator owns it.
process.stdin.on('error', () => {});
addAbortSignal(signal, process.stdin);

try {
  const result = await runCommand({ args: process.argv.slice(2), env: process.env, input: process.stdin, signal });
  signal.throwIfAborted();
  process.stdout.write(JSON.stringify(result) + '\n');
} catch (error) {
  // Never print arbitrary errors, request headers, credentials or response bodies.
  const code = error instanceof ApiClientError ? error.error.code : signal.aborted ? 'cancelled' : 'invalid_request';
  process.stderr.write(JSON.stringify({ ok: false, code, retryable: false }) + '\n');
  process.exitCode = 1;
} finally {
  process.removeListener('SIGINT', cancel);
  process.removeListener('SIGTERM', cancel);
}
