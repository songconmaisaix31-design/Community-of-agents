import test from 'node:test';
import assert from 'node:assert/strict';
import { assertOAuthBrowserTarget, assertOAuthConfigPath } from './oauth-browser-guard.mjs';
const config = { GONGZHI_ISOLATED_TEST: 'true', GONGZHI_LOCAL_PROJECT: 'gongzhi-fulltest-c-20260914',
  GONGZHI_LOCAL_PG_PORT: '56640', GONGZHI_LOCAL_AUTH_PORT: '56641', GONGZHI_LOCAL_APP_PORT: '3079',
  GONGZHI_DATABASE_ENABLED: 'true', DATABASE_URL: 'postgres://crier_app:synthetic@127.0.0.1:56640/gongzhi_core_test' };
test('OAuth browser target permits only the released dedicated database and complete profile', () => {
  assert.doesNotThrow(() => assertOAuthBrowserTarget(config, 'true'));
  for (const key of Object.keys(config)) { const absent = { ...config }; delete absent[key]; assert.throws(() => assertOAuthBrowserTarget(absent, 'true')); }
  for (const value of [undefined, '', 'false']) assert.throws(() => assertOAuthBrowserTarget(config, value));
  for (const target of ['postgres://crier_app:x@47.93.118.110:56640/gongzhi_core_test',
    'postgres://crier_app:x@127.0.0.1:56640/gongzhi', 'postgres://postgres:x@127.0.0.1:56640/gongzhi_core_test',
    'postgres://crier_app:x@127.0.0.1:56540/gongzhi_core_test']) assert.throws(() => assertOAuthBrowserTarget({ ...config, DATABASE_URL: target }, 'true'));
  assert.throws(() => assertOAuthBrowserTarget({ ...config, GONGZHI_LOCAL_PROJECT: 'wrong' }, 'true'));
  assert.throws(() => assertOAuthConfigPath('C:/unapproved/core-test.env'));
});
