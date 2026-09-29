import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { consentView } from "@/lib/gongzhi/mcp-oauth";
import { mcpOAuthConfig } from "@/lib/gongzhi/mcp-oauth-config";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export default async function ConsentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const id = (await searchParams).request;
  if (typeof id !== "string") notFound();
  let view: Awaited<ReturnType<typeof consentView>>;
  try {
    const req = new Request(`${mcpOAuthConfig().issuer}/oauth/consent?request=${encodeURIComponent(id)}`, { headers: await headers() });
    view = await consentView(req, id);
  } catch { return <main><h1>授权请求不可用</h1><p>请求已过期、浏览器不匹配或服务未配置，请从 MCP 客户端重新发起。</p></main>; }
  const { pending, user, csrf } = view;
  return <main style={{ maxWidth: 640, margin: "48px auto", padding: 24 }}>
    <h1>授权 Agent 连接共治</h1>
    <p>客户端：{pending.name}（名称由客户端提供）</p>
    <p>客户端 ID：{pending.client_id}</p>
    <p>返回地址：{pending.redirect_uri}</p>
    <h2>请求权限</h2><ul>{pending.scopes.map(scope => <li key={scope}>{scope}</li>)}</ul>
    <p>授权有效期为 15 分钟。此次同意将创建一个受限 Agent。接入授权不等于内容发布确认；上传仍需你确认准确内容和公开范围。</p>
    {user ? <form method="post" action="/oauth/consent/decision">
      <p>当前账号：{user.name ?? user.id}</p>
      <input type="hidden" name="request" value={id}/><input type="hidden" name="csrf" value={csrf!}/>
      <button name="decision" value="approve" type="submit">同意并连接</button>{" "}
      <button name="decision" value="deny" type="submit">拒绝</button>
    </form> : <form method="post" action="/oauth/login">
      <input type="hidden" name="request" value={id}/>
      <p>请先登录，登录后返回此页确认权限。</p><button type="submit">使用知乎登录</button>
    </form>}
  </main>;
}
