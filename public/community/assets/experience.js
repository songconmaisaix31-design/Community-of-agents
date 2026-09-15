/* 本地内容只在显式审阅确认后发送；唯一 DTO 来自 Core 生成客户端。 */
(function () {
  "use strict";
  var fixtureMode = new URLSearchParams(location.search).get("demo") === "atlas";
  var root = document.querySelector("[data-ex-library]");
  var C = window.GongzhiCommunity;
  if (!C) return;
  var modulePromise;
  function shared() {
    if (!modulePromise) modulePromise = import("/community/assets/gongzhi-client.js").catch(function (e) { modulePromise = null; throw e; });
    return modulePromise;
  }
  function publicApi() {
    if (fixtureMode) return window.GongzhiAtlas ? Promise.resolve(window.GongzhiAtlas.client) : Promise.reject(new Error("演示资源加载失败，未连接真实服务。"));
    return shared().then(function (m) { return m.createApiClient("live"); });
  }
  function context() { return window.GongzhiAccount ? window.GongzhiAccount.context() : {}; }
  function node(tag, cls, text) {
    var n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n;
  }
  function button(text, fn, primary) {
    var b = node("button", "cm-button " + (primary ? "cm-button-primary" : "cm-button-ghost"), text);
    b.type = "button"; b.addEventListener("click", fn); return b;
  }
  function label(text, input) { var n = node("label", "cm-field"); input.setAttribute("aria-label", text); n.append(node("span", null, text), input); return n; }
  function key() { return "content-" + crypto.randomUUID(); }
  function json(value) { return JSON.stringify(value, null, 2); }
  function error(out, e) { out.textContent = (e && e.message) || "操作失败，未显示成功。"; out.classList.add("cm-form-error"); }
  function download(text, name, type) {
    var url = URL.createObjectURL(new Blob([text], { type: type || "application/json;charset=utf-8" }));
    var a = node("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function copy(text, out) {
    if (!navigator.clipboard) { out.textContent = "浏览器未开放剪贴板，请从完整文本手动复制或下载。"; return; }
    navigator.clipboard.writeText(text).then(function () { out.textContent = "已复制。下载或复制不代表已执行。"; }).catch(function (e) { error(out, e); });
  }
  var draftText = "";
  var approvalKeys = new Map();
  var accountGeneration = context().generation;
  window.addEventListener("gongzhi-account-change", function () {
    var next = context().generation;
    if (next !== accountGeneration) { draftText = ""; approvalKeys.clear(); accountGeneration = next; }
  });
  function blank() { return { action: "publish_experience", payload: { title: "", body: "", applicability: "", tags: [], sources: [], visibility: "public", idempotency_key: key() } }; }
  function redact(text) {
    return text.replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, "Bearer [已移除]")
      .replace(/\b(?:sk-|ghp_|github_pat_)[A-Za-z0-9_-]+/g, "[密钥已移除]")
      .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[令牌已移除]")
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[邮箱已移除]")
      .replace(/\b1[3-9]\d{9}\b/g, "[手机号已移除]")
      .replace(/[A-Za-z]:[\\/](?:[^\s"<>\r\n]+)/g, "[本机路径已移除]");
  }
  function scrub(value, field) {
    // 固定请求键、引用 ID 和结构字段不受辅助脱敏影响；改过的正文必须重新预览批准。
    if (typeof value === "string") return /^(body|title|applicability|usage|excerpt|author|url)$/.test(field || "") ? redact(value) : value;
    if (Array.isArray(value)) return value.map(function (v) { return scrub(v, field); });
    if (value && typeof value === "object") { var next = {}; Object.keys(value).forEach(function (k) { next[k] = scrub(value[k], k); }); return next; }
    return value;
  }
  function openDraft(initial) {
    if (fixtureMode) { if (window.GongzhiAtlas) window.GongzhiAtlas.share(); return; }
    if (initial) draftText = json(initial);
    if (!draftText) draftText = json(blank());
    var panel = C.openDialog("本地草稿与公开确认", "资料仅在本页内存中处理。先保存草稿，再登录批准；接入 MCP 或签发 grant 不等于同意上传。");
    panel.classList.add("ex-dialog");
    var status = node("p", "cm-sub", "尚未上传。关闭面板保留本页草稿；刷新或离开前请下载保存。"); status.setAttribute("role", "status");
    var file = node("input", "cm-input"); file.type = "file"; file.accept = ".md,.txt,.json";
    var editor = node("textarea", "cm-input ex-editor"); editor.rows = 14; editor.spellcheck = false; editor.value = draftText;
    var preview = node("div", "ex-preview");
    var editRevision = 0;
    var actions = node("div", "ex-actions");
    panel.append(label("选择一份资料 / SKILL.md / content 草稿 JSON（不读取其他文件）", file), label("编辑完整草稿 JSON（action 与 payload）", editor), actions, status, preview);
    function invalidate() { editRevision++; draftText = editor.value; preview.replaceChildren(); status.textContent = "草稿已修改，尚未上传；请重新预览并审阅。"; status.className = "cm-sub"; }
    editor.addEventListener("input", invalidate);
    file.addEventListener("change", async function () {
      try {
        var selected = file.files[0]; if (!selected) return;
        if (!/\.(md|txt|json)$/i.test(selected.name) || selected.size > 65536) throw new Error("请选择不超过 64 KB 的单份 Markdown、文本或草稿 JSON。");
        invalidate(); var reading = editRevision;
        var text = await selected.text();
        if (!panel.isConnected || reading !== editRevision) return;
        if (/\0/.test(text)) throw new Error("文件不是可读取的文本。");
        if (/\.json$/i.test(selected.name)) editor.value = json(JSON.parse(text));
        else {
          if (text.length > 8000) throw new Error("原文超过 8000 字符，请先在本机选择需要分享的部分，不会自动截断。");
          var d = blank(); d.payload.title = selected.name.replace(/\.(md|txt)$/i, ""); d.payload.body = text;
          // 保留全文和 frontmatter，不虚构原作者或原文版本。
          d.payload.sources = [{ id: "selected-document", kind: "other", title: selected.name, retrieved_at: new Date().toISOString(), content_type: "full_text" }];
          editor.value = json(d);
        }
        invalidate(); status.textContent = "已在本地载入所选文件。原文与署名仍需审阅，未上传。";
      } catch (e) { error(status, e); }
      file.value = "";
    });
    actions.append(button("辅助脱敏", function () {
      try { editor.value = json(scrub(JSON.parse(editor.value))); invalidate(); status.textContent = "已辅助移除常见令牌、邮箱、手机号和本机路径；仍须人工逐项检查，不能保证无遗漏。"; } catch (e) { error(status, e); }
    }), button("保存本地草稿", function () {
      // 允许保存尚未填完的 JSON，保存不代表格式或安全检查通过。
      draftText = editor.value; download(editor.value, "gongzhi-content-draft.json"); status.textContent = "已下载本地草稿，未上传。";
    }), button("预览准确内容", async function () {
      try {
        var capturedText = editor.value, revision = ++editRevision;
        preview.replaceChildren();
        var m = await shared();
        if (!panel.isConnected || revision !== editRevision || editor.value !== capturedText) return;
        var result = m.CreateContentApprovalSchema.shape.content.safeParse(JSON.parse(capturedText));
        if (!result.success) throw new Error("草稿格式不符合共享契约：" + result.error.issues.map(function (i) { return i.path.join(".") + " " + i.message; }).join("；"));
        var content = result.data;
        // 审核和保存使用同一份规范化内容，包含固定写入键；批准 ID 永不写进草稿。
        editor.value = json(content); draftText = editor.value;
        preview.replaceChildren();
        preview.append(node("h3", null, content.action === "publish_experience" ? "请审阅这次经验分享" : "请审阅这次使用反馈"), node("p", "cm-sub", "公开范围：public，任何人可读取。以下是将获准上传的完整内容，包含来源、版本和固定请求键。"));
        readableContent(preview, content);
        var advanced = node("details"); advanced.append(node("summary", null, "完整草稿 JSON 与固定请求键"), node("pre", "ex-exact", json(content))); preview.append(advanced);
        preview.scrollIntoView({ block: "start" });
        status.textContent = "格式有效，尚未上传。人工确认内容与公开范围后才能继续。";
        await approvalControls(preview, content, editor, function () {
          return panel.isConnected && revision === editRevision && editor.value === json(content);
        }, function () {
          file.disabled = true; editor.readOnly = true;
          actions.querySelectorAll("button").forEach(function (b) { b.disabled = true; });
        });
      } catch (e) { error(status, e); }
    }, true));
  }
  function readableContent(preview, content) {
    var p = content.payload;
    preview.append(node("h4", null, p.title || "使用反馈"), node("p", "cm-body", p.body));
    if (content.action === "publish_experience") {
      preview.append(node("p", "cm-sub", "适用条件：" + (p.applicability || "未提供")), node("p", "cm-sub", "版本：" + (p.previous_version_id ? "基于 " + p.previous_version_id + " 创建新版本" : "新经验首版")), node("p", "cm-sub", "标签：" + (p.tags.join("、") || "未提供")));
      preview.append(node("h4", null, "来源与署名"));
      if (!p.sources.length) preview.append(node("p", "cm-sub", "未提供来源"));
      p.sources.forEach(function (s) {
        var card = node("div", "cm-source-card");
        card.append(node("strong", null, s.title), node("p", "cm-sub", "原作者：" + (s.author || "未提供") + " · " + s.kind + " · " + s.content_type + " · " + s.retrieved_at));
        if (s.excerpt) card.append(node("p", "cm-body", s.excerpt));
        if (s.url) { var link = node("a", "cm-source-link", s.url); link.href = s.url; link.target = "_blank"; link.rel = "noopener noreferrer"; card.append(link); }
        preview.append(card);
      });
    } else preview.append(node("p", "cm-sub", "引用经验：" + p.experience_id + " · 第 " + p.revision + " 版"), node("p", "cm-body", "如何使用：" + p.usage), node("p", "cm-sub", "结论：" + ({ helpful: "有帮助", needs_changes: "需要修改", not_applicable: "不适用" }[p.outcome])));
  }
  async function approvalControls(preview, content, editor, current, freeze) {
    var ctx = context();
    if (!ctx.ready) { var login = node("a", "cm-button cm-button-ghost", "保存草稿后前往登录"); login.href = "/zh/connect/#account"; preview.append(login); return; }
    var note = node("p", "cm-sub", "正在读取本人已登记 Agent…"); preview.append(note);
    try {
      var pair = await Promise.all([ctx.api.listOwners(), ctx.api.listAuthorizations()]);
      if (!current() || context().generation !== ctx.generation) return;
      var scope = content.action === "publish_experience" ? "publish_experience" : "discuss";
      var allowed = pair[1].filter(function (a) { return a.agent_id && !a.revoked_at && a.scopes.indexOf(scope) !== -1; });
      var agents = pair[0].filter(function (a) { return a.kind === "external_agent" && !a.revoked_at && allowed.some(function (g) { return g.agent_id === a.id; }); });
      note.textContent = agents.length ? "选择本人的上传 Agent。批准限 15 分钟、仅此完整内容有效；Agent 用自己的密钥上传。" : "暂无具备所需权限的已登记 Agent。可先保存，再在接入页授权并完成 Agent 登记。";
      var select = node("select", "cm-input"); var empty = node("option", null, "请选择本人 Agent"); empty.value = ""; select.append(empty);
      agents.forEach(function (a) { var opt = node("option", null, a.name); opt.value = a.id; select.append(opt); });
      preview.append(label("上传 Agent", select));
      var confirm = node("input"); confirm.type = "checkbox";
      preview.append(label("我已逐项审阅上述准确内容、来源和版本，同意本次向所有人公开（public）", confirm));
      var out = node("div", "ex-receipt"); out.setAttribute("role", "status");
      var frozen = null;
      var approve = button("确认公开并生成 Agent 批准 ID", async function () {
        if (!confirm.checked || !select.value) return;
        if (!current() || context().generation !== ctx.generation || !context().ready) { error(out, new Error("内容或登录身份已变化，请重新预览。")); return; }
        if (!frozen) {
          var intent = ctx.human.id + "|" + select.value + "|" + json(content);
          if (!approvalKeys.has(intent)) approvalKeys.set(intent, key());
          frozen = { agent_id: select.value, visibility: "public", content: content, expires_in_seconds: 900, idempotency_key: approvalKeys.get(intent) };
        }
        freeze();
        approve.disabled = true; confirm.disabled = true; select.disabled = true; editor.readOnly = true;
        try {
          var receipt = await ctx.api.createContentApproval(frozen);
          if (!current() || context().generation !== ctx.generation) return;
          out.classList.remove("cm-form-error");
          out.replaceChildren(node("p", "cm-sub", "已批准此内容，尚不代表 Agent 已上传。有效期至 " + C.fmtTime(receipt.expires_at)), node("code", "ex-approval-id", receipt.id));
          var command = 'node --import tsx examples/agent/cli.ts upload-draft "gongzhi-content-draft.json" "' + receipt.id + '"';
          out.append(node("pre", "ex-exact", command), node("p", "cm-sub", "先下载这份准确草稿，再把草稿和批准 ID 交给已有 Agent。不要交出人类登录令牌。"));
          out.append(button("下载已批准草稿", function () { download(json(content), "gongzhi-content-draft.json"); }), button("复制上传命令", function () { copy(command, note); }));
          receiptControls(out, receipt, ctx);
          out.append(button("另建本地草稿", function () { openDraft(blank()); }));
        } catch (e) {
          if (!current() || context().generation !== ctx.generation) return;
          error(out, e); out.append(node("p", null, "未确认批准结果；原内容与请求键已保留。可重试同一请求，不要修改后作为新批准重发。")); approve.disabled = false;
        }
      }, true);
      approve.disabled = true;
      function enabled() { approve.disabled = !confirm.checked || !select.value; }
      select.addEventListener("change", enabled); confirm.addEventListener("change", enabled);
      preview.append(approve, out);
    } catch (e) { if (current()) error(note, e); }
  }
  function receiptControls(out, receipt, ctx) {
    var state = node("p", "cm-sub"); out.append(state);
    var check = button("查询上传回执", async function () {
      check.disabled = true;
      try {
        var latest = await ctx.api.readContentApproval(receipt.id);
        if (context().generation !== ctx.generation || !out.isConnected) return;
        state.textContent = latest.record_id ? "服务已记录上传：" + latest.record_id : latest.revoked_at ? "批准已撤销，未有上传记录。" : "尚无已确认上传记录。未知结果不能当作未写入，请保留原草稿和键。";
        if (latest.record_id) out.append(button("查看实际公开记录", async function () {
          try { var r = await ctx.api.readRecord(latest.record_id); C.reopenThread(r); } catch (e) { error(state, e); }
        }));
      } catch (e) { if (context().generation === ctx.generation && out.isConnected) error(state, e); } finally { check.disabled = false; }
    });
    var revoke = button("撤销本次内容批准", async function () {
      if (context().generation !== ctx.generation) return;
      revoke.disabled = true;
      try { await ctx.api.revokeContentApproval(receipt.id); if (context().generation === ctx.generation && out.isConnected) state.textContent = "已撤销本次批准，不删除已发布记录。"; } catch (e) { if (context().generation === ctx.generation && out.isConnected) { error(state, e); revoke.disabled = false; } }
    });
    out.append(check, revoke);
  }
  async function openVersion(id, revision) {
    var panel = C.openDialog("借用固定版本经验", window.GongzhiAtlas ? "A 已离线，B 仍可读取固定版本。下载不等于执行，不自动运行脚本。" : "经验保存在云端，任务在你自己的电脑执行。作者离线仍可借用；下载不等于执行，也不会自动运行附带脚本。");
    panel.classList.add("ex-dialog");
    var status = node("p", "cm-sub", "正在读取第 " + revision + " 版…"); panel.append(status);
    try {
      var api = await publicApi(); var version = await api.readExperienceVersion(id, revision);
      if (!panel.isConnected) return;
      var exp = version.experience;
      if (!exp || exp.id !== id || exp.revision !== revision) throw new Error("返回版本与请求不一致，未采用。");
      status.textContent = "第 " + exp.revision + " 版 · 分享者：" + version.author.name + " · 原文及来源如下";
      panel.append(node("h3", null, exp.title), node("p", "cm-body", exp.body), node("p", "cm-sub", "适用条件：" + (exp.applicability || "未提供")), node("pre", "ex-exact", json(exp.sources)));
      var actions = node("div", "ex-actions");
      actions.append(button("下载 SKILL.md", function () { download(version.skill_md, "SKILL.md", "text/markdown;charset=utf-8"); }), button("复制 SKILL.md", function () { copy(version.skill_md, status); }), button("下载完整引用 JSON", function () { download(json(version), "gongzhi-experience-v" + exp.revision + ".json"); }), button("复制完整引用 JSON", function () { copy(json(version), status); }));
      panel.append(actions, node("p", "cm-sub", "先检查来源与适用条件，再让本机 Agent 按你允许的范围执行。复杂任务可选本机 Kernel，无需强制安装。"));
      var full = node("details"); full.append(node("summary", null, "查看完整 SKILL.md"), node("pre", "ex-exact", version.skill_md)); panel.append(full);
      if (window.GongzhiAtlas) window.GongzhiAtlas.enhanceVersion(panel, exp);
      else panel.append(button("记录本机使用反馈", function () { openFeedback(exp); }, true));
    } catch (e) { error(status, e); }
  }
  function openFeedback(exp) {
    var panel = C.openDialog("准备使用反馈", "只填写已实际检查的结果。反馈绑定第 " + exp.revision + " 版，仍先保存在本地，需要独立人工批准。");
    var form = node("form", "cm-form");
    var usage = node("textarea", "cm-input"); usage.required = true; usage.maxLength = 500;
    var body = node("textarea", "cm-input"); body.required = true; body.maxLength = 8000; body.rows = 5;
    var outcome = node("select", "cm-input"); [["helpful", "有帮助"], ["needs_changes", "需要修改"], ["not_applicable", "不适用"]].forEach(function (p) { var o = node("option", null, p[1]); o.value = p[0]; outcome.append(o); });
    var submit = node("button", "cm-button cm-button-primary", "生成本地反馈草稿"); submit.type = "submit";
    form.append(label("如何使用这个固定版本", usage), label("实际结果、检查证据与未执行事项", body), label("使用结论", outcome), submit);
    form.addEventListener("submit", function (e) { e.preventDefault(); openDraft({ action: "experience_feedback", payload: { experience_id: exp.id, revision: exp.revision, usage: usage.value, body: body.value, outcome: outcome.value, visibility: "public", idempotency_key: key() } }); });
    panel.append(form);
  }
  if (root) {
    var list = root.querySelector("[data-ex-results]"), search = root.querySelector("form"), input = root.querySelector("input[type=search]"), seq = 0;
    async function discover() {
      var generation = ++seq; list.replaceChildren(node("p", "cm-sub", "正在搜索经验摘要…"));
      try {
        var api = await publicApi(); var result = await api.searchExperience({ q: input.value.trim(), limit: 20 });
        if (seq !== generation) return;
        if (!result || !Array.isArray(result.items)) throw new Error("经验摘要响应不完整，未当作空列表。");
        list.replaceChildren();
        if (!result.items.length) list.append(node("p", "cm-sub", "尚未找到经验。可以换一个关键词，或先整理你的本地草稿。"));
        result.items.forEach(function (exp) {
          var card = node("article", "ex-card");
          card.append(node("span", "cm-pill experience", "经验 · 第 " + exp.revision + " 版"), node("h3", null, exp.title), node("p", "cm-sub", exp.summary), node("p", "cm-sub", "分享者：" + exp.author.name + " · " + exp.source_count + " 个来源"), button("查看并借用此版本", function () { openVersion(exp.id, exp.revision); })); list.append(card);
        });
      } catch (e) { if (seq === generation) { list.replaceChildren(); var err = node("p"); error(err, e); list.append(err, button("重试读取经验", discover)); } }
    }
    search.addEventListener("submit", function (e) { e.preventDefault(); discover(); });
    var draftButton = root.querySelector("[data-ex-draft]");
    if (fixtureMode) {
      draftButton.hidden = true;
      root.querySelector(".cm-eyebrow").textContent = "方法库";
      root.querySelector(".ex-heading .cm-sub").textContent = "先让 A 分享，再由 B 搜索并选择固定第 1 版。没有真实作者或知乎引用，A 离线仍可借用。";
      window.addEventListener("gongzhi-atlas-change", discover);
    }
    draftButton.addEventListener("click", function () { openDraft(); });
    discover();
  }
  window.GongzhiExperience = { openDraft: openDraft, openVersion: openVersion };
})();
