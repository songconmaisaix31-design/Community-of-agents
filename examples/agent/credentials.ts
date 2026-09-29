import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const format = 'gongzhi-agent-credential-v1';

function outsideRepository(path: string) {
  const location = relative(repository, path);
  if (!location || (!location.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')) && !isAbsolute(location))) throw new Error('Credential files must be outside the repository.');
}

export async function prepareCredentialPath(path: string) {
  const absolute = resolve(path);
  outsideRepository(absolute);
  await mkdir(dirname(absolute), { recursive: true });
  const parent = await realpath(dirname(absolute));
  outsideRepository(parent);
  try {
    await lstat(absolute);
    throw new Error('Credential file already exists; registration will not overwrite it.');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  return absolute;
}

/** Only the configured Gongzhi file is read; never discover another CLI's auth files. */
export async function readAgentCredential(path: string, origin: string): Promise<string> {
  const absolute = resolve(path);
  outsideRepository(await realpath(absolute));
  const info = await lstat(absolute);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 16_384) throw new Error('Invalid Gongzhi credential file.');
  const value = JSON.parse(await readFile(absolute, 'utf8'));
  if (value.format !== format || value.origin !== new URL(origin).origin || typeof value.api_key !== 'string' || !value.api_key.trim()) throw new Error('Credential file does not match this deployment.');
  return value.api_key;
}

export async function saveAgentCredential(path: string, origin: string, apiKey: string) {
  if (!apiKey.trim()) throw new Error('Registration did not return a credential.');
  // Exclusive creation prevents replacing an existing identity during a repeated command.
  const absolute = await prepareCredentialPath(path);
  await writeFile(absolute, JSON.stringify({ format, origin: new URL(origin).origin, api_key: apiKey }) + '\n', { flag: 'wx', mode: 0o600 });
}
