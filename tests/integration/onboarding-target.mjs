import { win32 } from 'node:path';
import { lstat, realpath } from 'node:fs/promises';

const legacy = Object.freeze({
  origin: 'http://127.0.0.1:3069', authUrl: 'http://127.0.0.1:56541',
  project: 'gongzhi-onboarding-i-20260914',
  privateDir: 'C:/Users/DW/AppData/Local/gongzhi/onboarding-i-20260914',
});
const fulltest = Object.freeze({
  origin: 'http://127.0.0.1:3079', authUrl: 'http://127.0.0.1:56641',
  project: 'gongzhi-fulltest-c-20260914',
  privateDir: 'C:/Users/DW/AppData/Local/gongzhi/fulltest-c-20260914/integration-credentials',
});
const normalize = value => win32.normalize(value).replace(/[\\/]+$/, '').toLowerCase();

/** Validate every target before login, CLI invocation or any file/API write. */
export function onboardingTarget(env) {
  const profile = env.GONGZHI_ONBOARDING_PROFILE;
  if (profile !== undefined && profile !== 'fulltest-c-20260914') throw new Error('Unknown onboarding profile');
  const expected = profile === undefined ? legacy : fulltest;
  for (const [field, value] of [['SITE_URL', expected.origin], ['SUPABASE_URL', expected.authUrl], ['GONGZHI_LOCAL_PROJECT', expected.project]]) {
    if (env[field] !== value) throw new Error(`Onboarding target mismatch: ${field}`);
  }
  const dir = env.GONGZHI_ONBOARDING_CREDENTIAL_DIR;
  if (typeof dir !== 'string' || !win32.isAbsolute(dir) || dir.includes('\0') ||
      dir.split(/[\\/]/).some(part => part === '.' || part === '..') || normalize(dir) !== normalize(expected.privateDir)) {
    throw new Error('Onboarding private directory mismatch');
  }
  return expected;
}

/** Refuse a missing directory, junction/symlink, or redirected parent path. */
export async function verifyOnboardingDirectory(target) {
  const info = await lstat(target.privateDir);
  if (!info.isDirectory() || info.isSymbolicLink() || normalize(await realpath(target.privateDir)) !== normalize(target.privateDir)) {
    throw new Error('Onboarding private directory is not the reviewed physical directory');
  }
}
