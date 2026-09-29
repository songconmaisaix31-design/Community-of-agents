import test from "node:test";
import assert from "node:assert/strict";
import { databaseSsl } from "../../lib/database-ssl.ts";
test("only explicit Docker host opt-in adds a local database exception; remote TLS stays required", () => {
  for (const host of ["localhost", "127.0.0.1", "[::1]"]) assert.equal(databaseSsl(`postgres://app@${host}/gongzhi`), undefined);
  assert.equal(databaseSsl("postgres://app@host.docker.internal:56520/gongzhi", "false"), "require");
  assert.equal(databaseSsl("postgres://app@host.docker.internal:56520/gongzhi", "true"), undefined);
  for (const host of ["database.example.com", "host.docker.internal.example.com"]) assert.equal(databaseSsl(`postgres://app@${host}/gongzhi`, "true"), "require");
});
