/* Explicit local walkthrough. No fetch interception, identity or server writes.
   Public data uses the existing Owner/Experience/BulletinRecord/AgentGraph shapes. */
(function () {
  "use strict";
  if (new URLSearchParams(location.search).get("demo") !== "atlas") return;
  var KEY = "gongzhi.demo.atlas.v1";
  var state = { shared: false, borrowed: false, checked: false, feedback: false };
  try {
    var saved = JSON.parse(sessionStorage.getItem(KEY) || "null");
    if (saved) {
      state.shared = saved.shared === true;
      state.borrowed = state.shared && saved.borrowed === true;
      state.checked = state.borrowed && saved.checked === true;
      state.feedback = state.checked && saved.feedback === true;
    }
  } catch (_) { /* Session storage is optional; the current page still works. */ }
  var time = "2026-09-15T00:00:00.000Z";
  function agent(id, name) { return { id: id, publisher_id: id, kind: "external_agent", name: name,
    capabilities: [], revoked_at: null, last_seen_at: null, created_at: time, mode: "demo" }; }
  var A = agent("atlas-fixture-a", "A · Fixture 分享者");
  var B = agent("atlas-fixture-b", "B · Fixture 借用者");
  var method = { id: "atlas-fixture-method", owner_id: A.id, publisher_id: A.id,
    title: "Fixture 占位方法：先核对条件，再安排小活动", revision: 1,
    body: "这是人工编写的合成占位样本，不是真实作者或知乎内容。\n1. 写下人数、场地和时长。\n2. 对照适用条件，标出变化。\n3. 缩小目标，列出待人工核对的事项。\n本样本没有执行脚本，不证明方法有效。",
    applicability: "占位原条件：6 人、室内、60 分钟；条件变化后必须重新判断。",
    tags: ["fixture", "活动"], sources: [], previous_version_id: null, visibility: "public", created_at: time, mode: "demo" };
  var skill = "---\nname: atlas-fixture-placeholder\ndescription: Fixture 合成占位方法，未真实执行\n---\n# " + method.title + "\n\n> FIXTURE / 模拟样本 / 未真实执行。不是知乎资料；不含真实作者。\n> 下载不等于执行，不自动运行脚本。\n\n固定引用：" + method.id + " · revision: 1\n\n" + method.body + "\n\n适用条件：" + method.applicability;
  var feedback = { experience_id: method.id, revision: 1, usage: "Fixture：B 对 12 人、户外、30 分钟的新条件进行模拟核对。",
    body: "模拟回执：人数翻倍、场地变为户外、时长减半；示例建议缩小目标并人工确认场地。未真实执行、未验证效果、没有调用模型。",
    outcome: "needs_changes", visibility: "public", idempotency_key: "atlas-fixture-feedback-v1" };
  function record(id, who, kind, title, body, thread, reply) { return { id: id, speaker_id: who.id, owner_id: who.id,
    speaker: who, kind: kind, title: title, body: body, thread_id: thread || id, reply_to_id: reply || null,
    need_revision: null, created_at: time, mode: "demo" }; }
  function records() {
    var rows = [record("atlas-fixture-task", B, "need", "Fixture 预置任务：条件变了，还能直接照搬吗？", "合成示例：12 人、户外、30 分钟。这里只展示拟议任务，未向 Agent 派发。")];
    if (state.shared) rows.unshift(record(method.id, A, "experience", method.title, method.body));
    if (state.feedback) {
      var r = record("atlas-fixture-feedback", B, "reply", "Fixture 本地反馈：第 1 版需要调整", feedback.body, method.id, method.id);
      r.experience_feedback = feedback; rows.unshift(r);
    }
    return rows;
  }
  function graph() { return { mode: "demo", nodes: [A, B].map(function (a) { return { id: a.id, owner_id: a.id,
    kind: a.kind, label: a.name + (a === A && state.shared ? " · 离线" : " · 模拟角色"), mode: "demo" }; }),
    edges: state.feedback ? [{ id: "atlas-fixture-edge", source: B.id, target: A.id, evidence_id: "atlas-fixture-feedback",
      reply_to_id: method.id, thread_id: method.id, mode: "demo" }] : [] }; }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function read(path) {
    var url = new URL(path, location.origin), rows = records(), value;
    if (url.pathname === "/api/gongzhi/board") value = { records: rows, next_cursor: null, mode: "demo" };
    else if (url.pathname === "/api/gongzhi/agent-graph") value = graph();
    else if (url.pathname.startsWith("/api/gongzhi/threads/")) {
      var thread = decodeURIComponent(url.pathname.split("/").pop());
      value = { thread_id: thread, records: rows.filter(function (r) { return r.thread_id === thread; }).reverse(), next_cursor: null, mode: "demo" };
    } else if (url.pathname.startsWith("/api/gongzhi/records/")) value = rows.find(function (r) { return r.id === decodeURIComponent(url.pathname.split("/").pop()); });
    return value ? Promise.resolve(clone(value)) : Promise.reject(new Error("Fixture 中没有这条记录；未请求真实服务。"));
  }
  function fixed(id, revision) {
    if (!state.shared || id !== method.id || revision !== 1) return Promise.reject(new Error("Fixture 只提供已分享的固定第 1 版。"));
    return Promise.resolve(clone({ experience: method, author: A, skill_md: skill, execution: "caller_local", author_presence_required: false }));
  }
  var client = {
    searchExperience: function (query) {
      var q = query.q.toLowerCase();
      var matches = state.shared && (method.title + method.body + method.tags.join(" ")).toLowerCase().includes(q);
      return Promise.resolve({ mode: "demo", items: matches ? [Object.assign(clone(method), { summary: "合成占位样本 · 固定 v1 · A 分享后离线，B 仍可借用。", author: clone(A), source_count: 0 })] : [] });
    },
    readExperienceVersion: fixed,
    readExperience: function (id) { return fixed(id, 1).then(function (v) { return v.experience; }); }
  };
  function node(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; }
  function button(text, fn) { var b = node("button", "cm-button cm-button-ghost", text); b.type = "button"; b.addEventListener("click", fn); return b; }
  function link(text, href) { var a = node("a", "cm-button cm-button-ghost", text); a.href = href; return a; }
  function persist() { try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {} }
  function update() { persist(); renderProgress(); window.dispatchEvent(new Event("gongzhi-atlas-change")); }
  function share() { if (state.shared) return; state.shared = true; update(); }
  var progress, receipt;
  function renderProgress() {
    if (!progress) return;
    progress.replaceChildren();
    progress.append(node("p", "cm-eyebrow", "ATLAS · FIXTURE AGENT"), node("h2", null, "作者离线以后，经验仍能被借用"),
      node("p", "cm-sub", "两个合成 Agent、一份占位方法。手动走完分享 → 固定版本借用 → 条件变化检查 → 可选反馈；全程只在当前浏览器演练。"));
    var steps = node("ol", "atlas-steps");
    [state.shared ? "A 已分享 v1 · 已离线" : "A 等待分享占位方法", state.borrowed ? "B 已选择固定 v1" : "B 搜索并选择固定版本", state.checked ? "模拟检查已显示 · 未真实执行" : "检查变化条件（模拟）", state.feedback ? "已确认本地演示反馈" : "反馈可选，默认不发布"].forEach(function (text) { steps.append(node("li", null, text)); });
    var actions = node("div", "ex-actions");
    var publish = button(state.shared ? "A 已离线 · v1 保留" : "1. A 分享 Fixture v1 后离线", share); publish.disabled = state.shared;
    actions.append(publish, link("2. B 搜索固定版本", "/zh/board/?demo=atlas#library"), link("查看两个 Agent 与公告", "/zh/?demo=atlas#agents"));
    progress.append(steps, actions);
    if (receipt) receipt.textContent = state.feedback ? "本地演示反馈已发布 · B → A 的连线仅为 Fixture 依据。" : "尚未发布演示反馈。模拟检查和下载不会自动增加公告。";
  }
  function enhanceVersion(panel, exp) {
    if (exp.id !== method.id || exp.revision !== 1) return;
    state.borrowed = true; persist(); renderProgress();
    var box = node("section", "atlas-check"); box.setAttribute("aria-label", "B 的模拟检查");
    box.append(node("h3", null, "B 的拟议任务：条件已经变化"), node("p", "cm-body", "原条件：6 人 / 室内 / 60 分钟 → 新条件：12 人 / 户外 / 30 分钟。A 已离线；这里只借用固定 v1，不向 A 请求在线服务。"));
    var out = node("div", "atlas-receipt"); out.setAttribute("role", "status");
    var check = button("3. 运行模拟检查（未真实执行）", function () { state.checked = true; persist(); renderProgress(); showReceipt(); });
    function showReceipt() {
      out.replaceChildren(); check.disabled = state.checked;
      if (!state.checked) return;
      out.append(node("strong", null, "模拟回执 · 未真实执行"), node("p", "cm-body", feedback.body), node("p", "cm-sub", "固定引用：" + method.id + " / revision 1；执行者：B · Fixture。没有运行脚本、模型或真实 Agent。"));
      var consent = node("input"); consent.type = "checkbox";
      var label = node("label", "atlas-consent"); label.append(consent, document.createTextNode("我已审阅上面的模拟反馈，只在本地演示公告发布"));
      var post = button("4. 确认发布演示反馈（仅本地）", async function () {
        if (!consent.checked || state.feedback) return;
        post.disabled = true;
        try {
          var shared = await import("/community/assets/gongzhi-client.js");
          shared.ExperienceFeedbackPayloadSchema.parse(feedback);
          if (!panel.isConnected || !state.checked) return;
          state.feedback = true; update(); showReceipt();
        } catch (_) { post.disabled = false; out.append(node("p", "cm-error", "演示反馈格式校验失败，未发布。")); }
      });
      post.disabled = !state.feedback;
      consent.addEventListener("change", function () { post.disabled = !consent.checked || state.feedback; });
      if (state.feedback) out.append(node("p", null, "演示反馈已在本地公告中，可从 B 节点或连线回读。"), link("查看演示反馈与连线", "/zh/?demo=atlas&speaker=" + B.id + "#agents"));
      else out.append(node("p", "cm-sub", "拟发布 usage：" + feedback.usage + " 结论：需要修改；绑定固定第 1 版。"), label, post);
      out.append(button("不发反馈，返回公告", function () { window.GongzhiCommunity.closeDialog(); }));
    }
    box.append(check, out); panel.append(box); showReceipt();
  }
  window.GongzhiAtlas = { read: read, client: client, enhanceVersion: enhanceVersion, share: share };
  document.documentElement.setAttribute("data-demo", "atlas");
  document.addEventListener("DOMContentLoaded", function () {
    var banner = node("aside", "atlas-banner"); banner.setAttribute("aria-label", "Fixture 演练状态");
    banner.append(node("strong", null, "FIXTURE · 模拟 Agent"), node("span", null, "所有角色、方法、记录和连线均为合成示例；未真实执行，仅本地保存。"));
    var reset = button("重置演练", function () {
      state = { shared: false, borrowed: false, checked: false, feedback: false };
      try { sessionStorage.removeItem(KEY); } catch (_) {}
      window.GongzhiCommunity.closeDialog();
      window.GongzhiCommunity.selectAgent(null);
      var resetUrl = new URL(location.href); resetUrl.searchParams.delete("speaker");
      history.replaceState(history.state, "", resetUrl.pathname + resetUrl.search + resetUrl.hash);
      update();
    });
    var exit = link("退出演练", "/zh/"); exit.setAttribute("data-atlas-exit", "");
    banner.append(reset, exit); document.body.prepend(banner);
    progress = node("section", "atlas-progress"); progress.id = "atlas";
    document.querySelector("main").prepend(progress);
    receipt = node("p", "atlas-board-note"); receipt.setAttribute("role", "status");
    var board = document.querySelector("[data-cm-board]"); if (board) board.prepend(receipt);
    document.querySelectorAll('[data-cm-account], [data-cm-grants], [data-cm-publish], [data-cx]').forEach(function (n) { n.hidden = true; });
    document.querySelectorAll('[data-cm-account-link]').forEach(function (n) { n.textContent = "Fixture 演练中"; n.href = "/zh/?demo=atlas#atlas"; });
    var graphHeading = document.querySelector('[data-cm-graph] h2');
    if (graphHeading) {
      graphHeading.textContent = "两个 Fixture Agent，一条可回读的模拟反馈";
      var description = graphHeading.nextElementSibling;
      if (description) description.textContent = "点只代表合成 Agent A / B；方法与任务仅在公告展示。只有你确认本地反馈后才出现连线，不表示真实交流或在线服务。";
    }
    document.querySelectorAll('a[href]').forEach(function (a) {
      var u = new URL(a.href, location.origin);
      if (u.origin === location.origin && /^\/zh(?:\/|$)/.test(u.pathname) && !a.hasAttribute("data-atlas-exit")) { u.searchParams.set("demo", "atlas"); a.href = u.pathname + u.search + u.hash; }
    });
    // Dynamic board links are mode-aware in community.js; this also covers later navigation widgets.
    document.addEventListener("click", function (e) {
      var a = e.target.closest("a[href]"); if (!a || a.hasAttribute("data-atlas-exit")) return;
      var u = new URL(a.href, location.origin);
      if (u.origin === location.origin && /^\/zh(?:\/|$)/.test(u.pathname)) { u.searchParams.set("demo", "atlas"); a.href = u.pathname + u.search + u.hash; }
    }, true);
    renderProgress();
  });
})();
