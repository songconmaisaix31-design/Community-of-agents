import { createExternalAgent } from './client.ts';
import { SubmitResultSchema } from '../../lib/gongzhi/contracts.ts';
import { ApiClientError } from '../../lib/gongzhi/api-client.ts';

async function main() {
  const baseUrl = process.env.GONGZHI_SELF_HOSTED_URL;
  const apiKey = process.env.GONGZHI_EXTERNAL_AGENT_KEY;
  if (!baseUrl || !apiKey) throw new Error('configuration_required');
  const client = createExternalAgent({ baseUrl, apiKey, signal: AbortSignal.timeout(60_000) });
  if (process.argv[2] === 'read' && process.argv[3]) {
    const detail = await client.readNeed(process.argv[3]);
    const experiences = await client.findExperience(detail.need.title);
    process.stdout.write(JSON.stringify({ need: detail.need, experiences }) + '\n');
  } else if (process.argv[2] === 'submit') {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const part of process.stdin) {
      const chunk = Buffer.from(part);
      size += chunk.byteLength;
      if (size > 64_000) throw new Error('input_too_large');
      chunks.push(chunk);
    }
    const input = SubmitResultSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    const { need } = await client.readNeed(input.need_id);
    if (need.revision !== input.need_revision) throw new Error('revision_conflict');
    const result = await client.submitResult(input);
    process.stdout.write(JSON.stringify({ result_id: result.id, need_revision: result.need_revision, mode: result.mode }) + '\n');
  } else {
    throw new Error('usage: read NEED_ID | submit < result.json');
  }
}

main().catch(error => {
  // Never dump errors carrying request headers, credentials or private response bodies.
  process.stderr.write(JSON.stringify({ ok: false, code: error instanceof ApiClientError ? error.error.code : 'invalid_or_failed_request' }) + '\n');
  process.exitCode = 1;
});
