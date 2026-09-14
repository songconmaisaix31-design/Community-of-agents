import { realpathSync } from 'node:fs';
import path from 'node:path';
import { assertLocalDatabase, testProfileFromEnv } from '../../infra/local-auth/local-profile.mjs';

export const oauthBrowserBase = 'http://127.0.0.1:3091';
export const oauthDatabaseEnv = 'C:/Users/DW/AppData/Local/gongzhi/fulltest-c-20260914/core-test.env';
export function assertOAuthBrowserTarget(config, optIn) {
  if (optIn !== 'true') throw new Error('Explicit OAuth browser PG test opt-in required');
  const profile = testProfileFromEnv(config);
  if (config.GONGZHI_ISOLATED_TEST !== 'true' || profile.project !== 'gongzhi-fulltest-c-20260914' ||
      profile.pgPort !== 56640 || profile.authPort !== 56641 || profile.appPort !== 3079 ||
      config.GONGZHI_DATABASE_ENABLED !== 'true') throw new Error('OAuth browser dedicated profile mismatch');
  assertLocalDatabase(config.DATABASE_URL, 56640, 'gongzhi_core_test');
}
export function assertOAuthConfigPath(file) {
  if (path.resolve(file) !== path.resolve(oauthDatabaseEnv) ||
      path.resolve(realpathSync(file)) !== path.resolve(oauthDatabaseEnv)) throw new Error('OAuth browser private config path mismatch');
}
