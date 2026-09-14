import test from 'node:test';
import assert from 'node:assert/strict';
import { onboardingTarget } from './onboarding-target.mjs';

const legacy = {
  SITE_URL: 'http://127.0.0.1:3069', SUPABASE_URL: 'http://127.0.0.1:56541',
  GONGZHI_LOCAL_PROJECT: 'gongzhi-onboarding-i-20260914',
  GONGZHI_ONBOARDING_CREDENTIAL_DIR: 'C:/Users/DW/AppData/Local/gongzhi/onboarding-i-20260914',
};
const isolated = {
  SITE_URL: 'http://127.0.0.1:3079', SUPABASE_URL: 'http://127.0.0.1:56641',
  GONGZHI_LOCAL_PROJECT: 'gongzhi-fulltest-c-20260914',
  GONGZHI_ONBOARDING_CREDENTIAL_DIR: 'C:/Users/DW/AppData/Local/gongzhi/fulltest-c-20260914/integration-credentials',
  GONGZHI_ONBOARDING_PROFILE: 'fulltest-c-20260914',
};

test('only complete legacy and explicitly selected fulltest targets are accepted', () => {
  assert.equal(onboardingTarget(legacy).origin, legacy.SITE_URL);
  assert.equal(onboardingTarget(isolated).origin, isolated.SITE_URL);
  assert.equal(onboardingTarget({ ...isolated, GONGZHI_ONBOARDING_CREDENTIAL_DIR: isolated.GONGZHI_ONBOARDING_CREDENTIAL_DIR.replaceAll('/', '\\') }).privateDir, isolated.GONGZHI_ONBOARDING_CREDENTIAL_DIR);
});

test('unknown or missing profile cannot redirect the historical target', () => {
  for (const profile of ['', 'production', 'fulltest-c', 'onboarding-i-20260914']) {
    assert.throws(() => onboardingTarget({ ...isolated, GONGZHI_ONBOARDING_PROFILE: profile }), /Unknown onboarding profile/);
  }
  const { GONGZHI_ONBOARDING_PROFILE, ...withoutProfile } = isolated;
  assert.throws(() => onboardingTarget(withoutProfile), /target mismatch/);
  assert.throws(() => onboardingTarget({ ...legacy, GONGZHI_ONBOARDING_PROFILE }), /target mismatch/);
});

test('each missing or mixed environment field rejects before any login or write', () => {
  for (const field of Object.keys(legacy)) {
    const incomplete = { ...isolated }; delete incomplete[field];
    assert.throws(() => onboardingTarget(incomplete), /mismatch/);
    assert.throws(() => onboardingTarget({ ...isolated, [field]: legacy[field] }), /mismatch/);
  }
});

test('public, alternate loopback and decorated URLs cannot target production', () => {
  for (const field of ['SITE_URL', 'SUPABASE_URL']) {
    for (const url of ['https://zhihu.davidwang.space', 'http://47.93.118.110', 'http://localhost:3079', 'http://127.0.0.1:3039', 'http://127.0.0.1:3079/', 'http://127.0.0.1:3079?target=production', 'http://user:secret@127.0.0.1:3079']) {
      assert.throws(() => onboardingTarget({ ...isolated, [field]: url }), /target mismatch/);
    }
  }
});

test('private files cannot escape to another account, project, share or subdirectory', () => {
  assert.throws(() => onboardingTarget({ ...isolated, GONGZHI_ONBOARDING_CREDENTIAL_DIR: 'C:/Users/DW/AppData/Local/gongzhi/fulltest-c-20260914' }), /private directory mismatch/);
  for (const dir of ['', '.', 'C:/Users/DW/.ssh', 'C:/Users/DW/AppData/Local/gongzhi/fulltest-c-20260914/child', 'C:/Users/DW/AppData/Local/gongzhi/other/../fulltest-c-20260914', '//server/share/fulltest-c-20260914', 'C:/Users/DW/AppData/Local/gongzhi/fulltest-c-20260914\0']) {
    assert.throws(() => onboardingTarget({ ...isolated, GONGZHI_ONBOARDING_CREDENTIAL_DIR: dir }), /private directory mismatch/);
  }
});
