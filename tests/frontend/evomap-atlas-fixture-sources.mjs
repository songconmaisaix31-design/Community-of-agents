// Read-only public-source audit. --verify-remote makes 100 requests, at most four concurrently.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
const source = await readFile("public/community/assets/atlas-agent-catalog.js", "utf8");
const catalog = JSON.parse(source.slice(source.indexOf("=") + 1).trim().replace(/;$/, ""));
const revision = "5ed4ad9f815c192ad4aac0a6e6b11640d2ec2a8f";
assert.equal(catalog.length, 100);
for (const key of ["id", "name", "specialty"]) assert.equal(new Set(catalog.map(p => p[key])).size, 100);
assert.equal(new Set(catalog.map(p => p.source.id)).size, 100);
for (const profile of catalog) {
  assert.match(profile.name, /^知乎 .+ 专家 Agent$/);
  assert.equal(profile.source.revision, revision);
  assert.match(profile.source.path, /^skills\/[a-zA-Z0-9_./-]+$/);
  assert.equal(profile.source.url, `https://github.com/sickn33/agentic-awesome-skills/blob/${revision}/${profile.source.path}/SKILL.md`);
}
console.log("Catalog: 100 unique roles / specialties / public skill references.");
if (process.argv.includes("--verify-report")) {
  const report = JSON.parse(await readFile(path.join(tmpdir(), "gongzhi-atlas-fixture-f", "public-skill-verification.json"), "utf8"));
  assert.equal(report.revision, revision);
  assert.equal(report.results.length, 100);
  assert.equal(new Set(report.results.map(r => r.id)).size, 100);
  for (const profile of catalog) {
    const result = report.results.find(r => r.id === profile.source.id);
    assert.equal(result.status, 200);
    assert.equal(result.name, profile.source.title);
    assert.equal(result.url, `https://raw.githubusercontent.com/sickn33/agentic-awesome-skills/${revision}/${profile.source.path}/SKILL.md`);
  }
  console.log("Existing public-source report: all 100 HTTP statuses, exact frontmatter names and pinned paths match (no new network).");
}
if (process.argv.includes("--verify-remote")) {
  const results = [];
  let next = 0;
  async function worker() {
    while (next < catalog.length) {
      const profile = catalog[next++];
      const url = `https://raw.githubusercontent.com/sickn33/agentic-awesome-skills/${revision}/${profile.source.path}/SKILL.md`;
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(20000), redirect: "error" });
        const body = await response.text();
        const frontmatter = body.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
        const name = frontmatter?.[1].match(/^name:\s*["']?([^\r\n]+?)["']?\s*$/m)?.[1]?.trim();
        const ok = response.status === 200 && name === profile.source.title;
        results.push({ id: profile.source.id, url, status: response.status, name: name || null, bytes: Buffer.byteLength(body), ok });
      } catch (error) { results.push({ id: profile.source.id, url, ok: false, error: error.message }); }
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));
  const directory = path.join(tmpdir(), "gongzhi-atlas-fixture-f");
  await mkdir(directory, { recursive: true });
  const report = path.join(directory, "public-skill-verification.json");
  await writeFile(report, JSON.stringify({ revision, checked_at: new Date().toISOString(), concurrency: 4, results }, null, 2));
  const failed = results.filter(r => !r.ok);
  console.log(`Public SKILL.md verification: ${results.length - failed.length}/100 HTTP 200 + frontmatter name; report ${report}`);
  if (failed.length) console.log(JSON.stringify(failed, null, 2));
  assert.equal(failed.length, 0, "Every displayed reference must resolve to a named SKILL.md.");
}
