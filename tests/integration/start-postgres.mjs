// Creates a new project-only test database; never reuses or modifies existing containers.
// No application migrations run here. Connection values stay in a temporary file.
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';

const image = 'pgvector/pgvector:0.8.6-pg17-bookworm';
const container = `gongzhi-integration-${randomUUID().slice(0, 12)}`;
const runtimeDir = mkdtempSync(join(tmpdir(), 'gongzhi-integration-'));
const adminPassword = randomBytes(32).toString('hex');
const appPassword = randomBytes(32).toString('hex');
const docker = (args, options = {}) => (execFileSync('docker', args, {
  encoding: 'utf8', windowsHide: true, timeout: 60_000, ...options,
}) ?? '').trim();

console.log(`Preparing ${container}; local runtime directory: ${runtimeDir}`);
// Pull this official image explicitly first; do not hide downloads in DB setup.
docker(['image', 'inspect', image, '--format', '{{.Id}}']);
docker(['run', '--detach', '--name', container,
  '--label', 'project=gongzhi-integration', '--restart', 'no',
  '--publish', '127.0.0.1::5432',
  '--mount', `type=volume,source=${container}-data,target=/var/lib/postgresql/data`,
  '--env', 'POSTGRES_DB=gongzhi_test', '--env', 'POSTGRES_USER=postgres',
  '--env', 'POSTGRES_PASSWORD', image], {
  env: { ...process.env, POSTGRES_PASSWORD: adminPassword },
});
const binding = docker(['port', container, '5432/tcp']);
if (!/^127\.0\.0\.1:\d+$/.test(binding)) throw new Error('Unexpected database port binding');
const port = binding.split(':')[1];
const credentialsPath = join(runtimeDir, 'database.env');
writeFileSync(credentialsPath, [
  `MIGRATION_DATABASE_URL=postgres://postgres:${adminPassword}@localhost:${port}/gongzhi_test`,
  `DATABASE_URL=postgres://crier_app:${appPassword}@localhost:${port}/gongzhi_test`,
  `GONGZHI_TEST_CONTAINER=${container}`,
  '',
].join('\n'), { mode: 0o600 });

let ready = false;
for (let attempt = 0; attempt < 30; attempt++) {
  try {
    docker(['exec', container, 'pg_isready', '-U', 'postgres', '-d', 'gongzhi_test'], { stdio: 'pipe' });
    ready = true;
    break;
  } catch {
    await setTimeout(1_000);
  }
}
if (!ready) throw new Error(`Test database did not become ready: ${container}`);

// Match the fixed upstream's extension prerequisites and optional role branches.
// Runtime grants and RLS policies remain owned by the application migrations.
const bootstrap = [
  'CREATE EXTENSION vector;',
  'CREATE EXTENSION pg_trgm;',
  'CREATE EXTENSION unaccent;',
  'CREATE EXTENSION pgcrypto;',
  'CREATE ROLE anon NOLOGIN;',
  'CREATE ROLE authenticated NOLOGIN;',
  `CREATE ROLE crier_app LOGIN PASSWORD '${appPassword}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;`,
  'GRANT USAGE ON SCHEMA public TO crier_app;',
].join('\n');
// Keep SQL input (including the generated test password) out of console output.
try {
  docker(['exec', '-i', container, 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1',
    '-U', 'postgres', '-d', 'gongzhi_test'], { input: bootstrap, stdio: ['pipe', 'pipe', 'pipe'] });
} catch {
  throw new Error(`Test database bootstrap failed; retained container: ${container}`);
}
const versions = docker(['exec', container, 'psql', '-X', '-At', '-U', 'postgres',
  '-d', 'gongzhi_test', '-c',
  "SELECT version(); SELECT extname || '=' || extversion FROM pg_extension ORDER BY extname;"]);
console.log(versions);
console.log(`Container: ${container}`);
console.log(`Binding: ${binding}`);
console.log(`Load connection variables from ${credentialsPath}; do not print or commit its contents.`);
console.log('No application migrations applied. Container and dedicated volume are retained for this task.');
