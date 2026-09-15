import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { consentView, handleOAuth, oauthErrorResponse } from "@/lib/gongzhi/mcp-oauth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = (req: Request) => handleOAuth(req, "consent");
export async function GET(req: Request) {
  try {
    const params = new URL(req.url).searchParams;
    if (params.getAll("request").length !== 1) return new Response("Invalid request", { status: 400 });
    const id = params.get("request")!, { pending, user, csrf } = await consentView(req, id);
    const input = (name: string, value: string) => h("input", { type: "hidden", name, value });
    const content = h("html", { lang: "zh-CN" }, h("head", null, h("meta", { charSet: "utf-8" }), h("meta", { name: "viewport", content: "width=device-width,initial-scale=1" }), h("title", null, "共治 · Agent 授权")),
      h("body", null, h("main", null, h("h1", null, "授权 Agent 连接共治"), h("p", null, `客户端：${pending.name}（名称由客户端提供）`), h("p", null, `客户端 ID：${pending.client_id}`),
        h("p", null, `返回地址：${pending.redirect_uri}`), h("h2", null, "请求权限"), h("ul", null, ...pending.scopes.map(scope => h("li", { key: scope }, scope))),
        h("p", null, "授权有效期为 15 分钟。此次同意将创建一个受限 Agent。接入授权不等于内容发布确认；上传仍需你确认准确内容和公开范围。"),
        user ? h("form", { method: "post", action: "/oauth/consent" }, h("p", null, `当前账号：${user.name ?? user.id}`), input("request", id), input("csrf", csrf!),
          h("button", { name: "decision", value: "approve", type: "submit" }, "同意并连接"), " ", h("button", { name: "decision", value: "deny", type: "submit" }, "拒绝"))
          : h("form", { method: "post", action: "/oauth/login" }, input("request", id), h("p", null, "请先登录，登录后返回此页确认权限。"), h("button", { type: "submit" }, "使用知乎登录")))));
    return new Response("<!doctype html>" + renderToStaticMarkup(content), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'", "X-Frame-Options": "DENY" } });
  } catch (error) { return oauthErrorResponse(error); }
}
