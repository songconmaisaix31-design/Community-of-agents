import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import postgres from "postgres";
import { bindOwner, resolveIdentity, changeOwner } from "../../lib/gongzhi/identity.ts";
import { createAuthorization, registerAgent, revokeAuthorization } from "../../lib/gongzhi/authorization.ts";
import { createContentApproval } from "../../lib/gongzhi/content-approval.ts";
import { createNeed, updateNeed, postReply, submitResult, decideResult, publishExperience } from "../../lib/gongzhi/service.ts";
import { discoverBoard, readThread, readRecord, getAgentGraph } from "../../lib/gongzhi/bulletin.ts";
import { handleGongzhiRequest } from "../../lib/gongzhi/http.ts";
import { handleMcpPost } from "../../lib/mcp.ts";
import { inTransaction, sql } from "../../lib/db.ts";

const configPath = process.env.GONGZHI_TEST_DATABASE_ENV;
test("corrections on dedicated local PG: enrollment, delegated publication, board and evidenced Agent graph", { skip: !configPath }, async t => {
  for (const line of (await readFile(configPath!, "utf8")).split(/\r?\n/)) { const m = /^([A-Z_]+)=(.*)$/.exec(line); if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, ""); }
  assert.ok(["127.0.0.1", "localhost"].includes(new URL(process.env.DATABASE_URL!).hostname));
  process.env.GONGZHI_DATABASE_ENABLED = "true";
  const users: Record<string,string> = { a: randomUUID(), b: randomUUID() };
  const auth = createServer((req,res) => { const id = users[(req.headers.authorization ?? "").replace("Bearer ","")]; res.writeHead(id ? 200 : 401, { "content-type": "application/json" }); res.end(JSON.stringify(id ? { id, aud: "authenticated", role: "authenticated", created_at: new Date().toISOString(), app_metadata: {}, user_metadata: {} } : { message: "invalid" })); });
  await new Promise<void>(resolve => auth.listen(0,"127.0.0.1",resolve));
  process.env.SUPABASE_URL = `http://127.0.0.1:${(auth.address() as {port:number}).port}`;
  process.env.SUPABASE_ANON_KEY = "local-auth-stub"; process.env.GONGZHI_AUTH_ENABLED = "true";
  const admin = postgres(process.env.MIGRATION_DATABASE_URL!, { max:1,onnotice:()=>{} });
  t.after(async () => { auth.closeAllConnections(); await new Promise<void>(resolve => auth.close(()=>resolve())); await admin.end(); await sql().end(); });
  const req = (token:string) => new Request("http://localhost",{ headers:{Authorization:`Bearer ${token}`} });
  const aReq=req("a"), bReq=req("b");
  await bindOwner(aReq,{name:"授权人A",kind:"human"}); await bindOwner(bReq,{name:"授权人B",kind:"human"});
  const humanA=await resolveIdentity(aReq), humanB=await resolveIdentity(bReq);
  const uid=randomUUID(), key=(v:string)=>`${uid}:${v}`;
  const grantInput={scopes:["read","publish_need","publish_experience","submit_result","discuss"],idempotency_key:key("grant")};
  const grant=await createAuthorization(aReq,grantInput);
  const registration={name:"自主Agent A",capabilities:["client description"],idempotency_key:key("register")};
  const results=await Promise.all([registerAgent(req(grant.grant_token!),registration),registerAgent(req(grant.grant_token!),registration)]);
  const registered=results.find(r=>r.api_key)!;
  const actorA=await resolveIdentity(req(registered.api_key!));
  const secondGrant=await createAuthorization(bReq,{...grantInput,idempotency_key:key("grant-b")});
  const second=await registerAgent(req(secondGrant.grant_token!),{idempotency_key:key("register-b")});
  const actorB=await resolveIdentity(req(second.api_key!));
  const input={title:`${uid} delegated request`,body:`${uid} requirement for evidence graph`,idempotency_key:key("need")};
  const need=await createNeed(actorA,input);
  await t.test("one credential on concurrent registration; same-key receipts do not reissue",async()=>{
    assert.equal(results.filter(r=>r.api_key).length,1); assert.equal(results[0].owner.id,results[1].owner.id);
    const again=await registerAgent(req(grant.grant_token!),registration); assert.equal(again.credential_state,"not_recoverable"); assert.equal(again.api_key,undefined);
    const regrant=await createAuthorization(aReq,grantInput); assert.equal(regrant.grant_token,undefined); assert.equal(regrant.authorization.id,grant.authorization.id);
    await assert.rejects(registerAgent(req(grant.grant_token!),{...registration,name:"changed"}),{code:"idempotency_conflict"});
    await assert.rejects(registerAgent(req(grant.grant_token!),{...registration,owner_id:humanB.owner.id}));
    await assert.rejects(registerAgent(req(grant.grant_token!),{...registration,scopes:["discuss"]}));
    await assert.rejects(createAuthorization(aReq,{...grantInput,scopes:["read"]}),{code:"idempotency_conflict"});
    await assert.rejects(createAuthorization(req(registered.api_key!),grantInput),{code:"forbidden"});
    const [row]=await admin`select token_hash from gongzhi_authorizations where id=${grant.authorization.id}`; assert.notEqual(row.token_hash,grant.grant_token);
  });
  await t.test("server derives human owner and speaker, preserves delegated need on human edit",async()=>{
    assert.equal(need.owner_id,humanA.owner.id); assert.equal(need.publisher_id,actorA.owner.publisher_id);
    const record=await readRecord(need.id); assert.equal(record.speaker_id,actorA.owner.id); assert.equal(record.owner_id,humanA.owner.id);
    assert.equal((await createNeed(actorA,input)).id,need.id);
    await assert.rejects(createNeed(actorA,{...input,owner_id:humanB.owner.id}));
    await assert.rejects(updateNeed(humanB,need.id,{...input,expected_revision:1,idempotency_key:key("foreign")}),{code:"forbidden"});
  });
  const reply=await postReply(actorB,{thread_id:need.id,category:"reply",body:`${uid} actual persisted reply from B`,expected_revision:1,idempotency_key:key("reply")});
  const supplement=await postReply(actorA,{thread_id:need.id,reply_to_id:reply.id,category:"supplement",body:`${uid} A follows up on B evidence`,expected_revision:1,idempotency_key:key("supplement")});
  const humanReply=await postReply(humanA,{thread_id:need.id,reply_to_id:reply.id,category:"reply",body:`${uid} human follows up separately`,expected_revision:1,idempotency_key:key("human-reply")});
  await t.test("Agent graph contains only agents and directly readable public exchanges",async()=>{
    const graph=await getAgentGraph(); assert.ok(graph.nodes.every(n=>["external_agent","platform_agent"].includes(n.kind)));
    assert.ok(!graph.nodes.some(n=>[humanA.owner.id,need.id,reply.id].includes(n.id)));
    const edge=graph.edges.find(e=>e.evidence_id===reply.id)!; assert.equal(edge.source,actorB.owner.id); assert.equal(edge.target,actorA.owner.id); assert.equal(edge.reply_to_id,need.id);
    assert.ok(graph.edges.some(e=>e.evidence_id===supplement.id && e.target===actorB.owner.id));
    assert.ok(!graph.edges.some(e=>e.evidence_id===humanReply.id));
    for(const id of [edge.evidence_id,edge.reply_to_id]) assert.equal((await readRecord(id)).mode,"live");
    assert.equal((await readThread(need.id)).records.length,4);
  });
  await t.test("scope cannot be escalated by descriptive capabilities; REST and MCP agree",async()=>{
    const limitedGrant=await createAuthorization(aReq,{scopes:["read"],idempotency_key:key("limited-grant")});
    const limited=await registerAgent(req(limitedGrant.grant_token!),{capabilities:["publish_need","discuss"],idempotency_key:key("limited-reg")});
    const request=new Request("http://localhost/api/gongzhi/needs",{method:"POST",headers:{Authorization:`Bearer ${limited.api_key}`},body:JSON.stringify({...input,idempotency_key:key("deny")})});
    const rest=await handleGongzhiRequest(request,["needs"]); assert.equal(rest.status,403); assert.equal((await rest.json()).error.code,"forbidden");
    const mcp=await handleMcpPost(new Request("http://localhost/mcp",{method:"POST",headers:{Authorization:`Bearer ${limited.api_key}`},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"create_need",arguments:{...input,idempotency_key:key("deny")}}})}));
    assert.equal((await mcp.json()).result.structuredContent.error.code,"forbidden");
    const actor=await resolveIdentity(req(limited.api_key!)); await assert.rejects(postReply(actor,{thread_id:need.id,category:"reply",body:"unauthorized",expected_revision:1,idempotency_key:key("deny-reply")}),{code:"forbidden"});
    await assert.rejects(publishExperience(actor,{title:"unauthorized",body:"unauthorized",idempotency_key:key("deny-exp")}),{code:"forbidden"});
  });
  await t.test("reply validation rejects cross-thread, missing/stale revisions and changed-key payload",async()=>{
    const other=await createNeed(humanA,{title:"Other discussion",body:`${uid} unrelated root`,idempotency_key:key("other")});
    const base={thread_id:need.id,category:"reply",body:`${uid} validation`,idempotency_key:key("invalid")};
    await assert.rejects(postReply(actorB,base),{code:"invalid_request"});
    await assert.rejects(postReply(actorB,{...base,expected_revision:99}),{code:"revision_conflict"});
    await assert.rejects(postReply(actorB,{...base,expected_revision:1,reply_to_id:other.id}),{code:"invalid_request"});
    await assert.rejects(postReply(actorB,{...base,expected_revision:1,idempotency_key:key("reply")}),{code:"idempotency_conflict"});
    await assert.rejects(sql()`update posts set body='changed' where id=${reply.id}`,/immutable gongzhi history/);
    const forged=randomUUID();
    await admin`insert into posts(id,publisher_id,kind,title,body,tags,parent_id,metadata,expires_at) values(${forged},${actorB.owner.publisher_id},'announcement','invalid imported relation','invalid cross-thread relation',${[]},${need.id},${admin.json({gongzhi:{subtype:'reply',mode:'live',reply_to_id:other.id,speaker_id:actorA.owner.id,owner_id:humanB.owner.id}})},now()+interval '1 day')`;
    await assert.rejects(readRecord(forged),{code:"not_found"});
    assert.ok(!(await getAgentGraph()).edges.some(e=>e.evidence_id===forged));
  });
  await t.test("stable cursor has no gaps for equal timestamps and filters by bound speaker",async()=>{
    await inTransaction(async()=>{ for(let i=0;i<3;i++) await postReply(actorB,{thread_id:need.id,category:"reply",body:`${randomUUID()} distinct observation ${i}`,expected_revision:1,idempotency_key:key(`page-${i}`)}); });
    const seen:string[]=[]; let cursor:string|undefined;
    do { const page=await discoverBoard({speaker_id:actorB.owner.id,limit:1,cursor}); seen.push(...page.records.map(r=>r.id)); cursor=page.next_cursor??undefined; } while(cursor);
    assert.equal(seen.length,4); assert.equal(new Set(seen).size,4); await assert.rejects(discoverBoard({cursor:"bad"}),{code:"invalid_request"});
  });
  await t.test("hidden, private and demo roots never supply graph evidence or board threads",async()=>{
    for(const patch of ["hidden","private","demo"]) {
      if(patch==="hidden") await admin`update posts set hidden_at=now() where id=${need.id}`;
      else await admin`update posts set metadata=jsonb_set(metadata,${['gongzhi',patch==='private'?'visibility':'mode']},${JSON.stringify(patch==='private'?'private':'demo')}::jsonb) where id=${need.id}`;
      assert.ok(!(await getAgentGraph()).edges.some(e=>e.thread_id===need.id));
      await assert.rejects(readRecord(reply.id),{code:"not_found"});
      await admin`update posts set hidden_at=null,metadata=jsonb_set(metadata #- '{gongzhi,visibility}','{gongzhi,mode}','"live"'::jsonb) where id=${need.id}`;
    }
  });
  await t.test("experience threads accept discussion without overwriting text or breaking search counters",async()=>{
    const payload={title:"Independent experience",body:`${uid} original reusable experience`,idempotency_key:key("thread-experience")};
    const approval=await createContentApproval(aReq,{agent_id:actorA.owner.id,visibility:"public",content:{action:"publish_experience",payload},idempotency_key:key("thread-experience-approval")});
    const experience=await publishExperience(actorA,{...payload,approval_id:approval.id});
    const discussion=await postReply(actorB,{thread_id:experience.id,category:"supplement",body:`${uid} independently supplied supplement`,idempotency_key:key("experience-discussion")});
    assert.equal(discussion.need_revision,null); assert.equal((await readThread(experience.id)).records.length,2);
    const [stored]=await sql()`select body,reply_count,tsv is not null searchable from posts where id=${experience.id}`;
    assert.equal(stored.body,experience.body); assert.equal(stored.reply_count,1); assert.equal(stored.searchable,true);
    await assert.rejects(sql()`update posts set body='overwrite experience' where id=${experience.id}`,/immutable gongzhi history/);
    assert.ok((await getAgentGraph()).edges.some(e=>e.evidence_id===discussion.id && e.target===actorA.owner.id));
  });
  await t.test("human edit preserves agent speaker and prevents old-result acceptance",async()=>{
    const result=await submitResult(actorB,{need_id:need.id,need_revision:1,title:"Result",body:`${uid} complete result before revision`,idempotency_key:key("result")});
    const update=await updateNeed(humanA,need.id,{...input,body:`${uid} new revision of delegated requirement`,expected_revision:1,idempotency_key:key("revision")}); assert.equal(update.revision,2);
    assert.equal((await readRecord(need.id)).speaker_id,actorA.owner.id);
    await assert.rejects(decideResult(humanA,need.id,{result_id:result.id,expected_revision:2,decision:"accept",idempotency_key:key("stale")}),{code:"revision_conflict"});
    await assert.rejects(decideResult(actorA,need.id,{result_id:result.id,expected_revision:2,decision:"accept",idempotency_key:key("agent-accept")}),{code:"forbidden"});
    const fresh=await submitResult(actorB,{need_id:need.id,need_revision:2,title:"Updated result",body:`${uid} current complete solution`,idempotency_key:key("fresh-result")});
    await decideResult(humanA,need.id,{result_id:fresh.id,expected_revision:2,decision:"accept",idempotency_key:key("accept")});
  });
  await t.test("revocation blocks cached actors, credential retry and registration while preserving history",async()=>{
    await assert.rejects(revokeAuthorization(bReq,grant.authorization.id),{code:"not_found"});
    await revokeAuthorization(aReq,grant.authorization.id);
    await assert.rejects(createNeed(actorA,input),{code:"revoked"});
    await assert.rejects(registerAgent(req(grant.grant_token!),registration),{code:"revoked"});
    await assert.rejects(changeOwner(aReq,actorA.owner.id,true),{code:"revoked"});
    assert.equal((await readRecord(supplement.id)).body,supplement.body);
    assert.ok((await getAgentGraph()).edges.some(e=>e.evidence_id===supplement.id));
    const expired=await createAuthorization(aReq,{scopes:["read"],idempotency_key:key("expired")}); await admin`update gongzhi_authorizations set expires_at=now()-interval '1 second' where id=${expired.authorization.id}`;
    await assert.rejects(registerAgent(req(expired.grant_token!),{idempotency_key:key("expired-reg")}),{code:"revoked"});
    for(const role of ["anon","authenticated"]) { const [priv]=await admin`select has_table_privilege(${role},'gongzhi_authorizations','INSERT') writable`; assert.equal(priv.writable,false); }
  });
});
