import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, rmdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareCredentialPath, readAgentCredential, saveAgentCredential } from '../../examples/agent/credentials.ts';

test('dedicated credentials are deployment-bound and cannot be overwritten', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'gongzhi-credential-test-'));
  const file = join(directory, 'agent.json');
  try {
    await saveAgentCredential(file, 'https://self-hosted.example.test', 'synthetic-only-key');
    assert.equal(await readAgentCredential(file, 'https://self-hosted.example.test'), 'synthetic-only-key');
    await assert.rejects(readAgentCredential(file, 'https://other.example.test'));
    await assert.rejects(saveAgentCredential(file, 'https://self-hosted.example.test', 'replacement'));
    assert.equal(JSON.parse(await readFile(file, 'utf8')).api_key, 'synthetic-only-key');
  } finally { await rm(file, { force: true }); await rmdir(directory); }
});

test('credential output under the repository is refused before creating a file', async () => {
  await assert.rejects(prepareCredentialPath(join(process.cwd(), 'examples/agent/should-not-exist.json')));
});
