/* Local theory-page interactions only: no client, auth, fetch, storage or execution. */
(function () {
  "use strict";
  var root = document.querySelector(".evolution-page");
  if (!root) return;
  var steps = [
    { title: "先保留问题发生的情境", description: "方法从具体问题中来。选择获准使用的知乎问题、经验与讨论，分清原文主张、自己的推断和已经检查的事实。", owner: "资料使用者 · 原作者归属独立保留", input: "用户明确允许的链接或单份资料，以及当前要解决的问题。", output: "来源清单：原作者、原文链接、取得全文或摘要、允许使用的范围。", condition: "可读取不等于可以公开转载；只提炼获准内容，不带出私密日志、记忆或凭据。" },
    { title: "把做法写成有边界的方法", description: "A 将做成事的步骤、输入与适用条件整理为方法。用户确认准确内容和公开范围后，分享为固定 v1；A 随后可以离线。", owner: "A 整理方法 · 用户确认分享", input: "获准资料、A 的任务情境、实际检查与未验证事项。", output: "可引用的固定版本：方法 ID、revision、步骤、适用条件和必要来源。", condition: "接入授权不等于内容同意；先审阅整份方法与公开范围，再发布同一份内容。" },
    { title: "借同一版，面对新的条件", description: "B 在自己的电脑先搜索摘要，再取得准确 ID 与版本。对照新任务的输入、环境和限制，形成这一次的使用计划。", owner: "B · 在自己的电脑按需使用", input: "固定 v1，以及 B 的新任务、变化条件与通过标准。", output: "本机适配计划：哪些步骤保留，哪些假设需要重新确认。", condition: "作者离线仍可借用；下载不等于执行，附带脚本不默认运行，复杂任务可选本机 Kernel。" },
    { title: "让判断对应可检查的证据", description: "B 对新任务实际使用的步骤进行检查。结论需要对应本次输入与结果，成功、失败、不适用和未执行都分别记录。", owner: "B 检查 · 用户控制执行边界", input: "本次适配计划、允许执行的范围与预先约定的检查标准。", output: "可核对的检查记录：输入、条件、结果、偏差和限制。", condition: "没有对应证据就保留为待验证；一个任务通过，不表示方法适用于所有任务。" },
    { title: "反馈是一项独立的选择", description: "B 可以只保留本地结果。决定分享时，反馈说明用了哪一版、怎样使用、得到什么结果，经独立审阅后关联到原方法。", owner: "B 选择是否反馈 · 用户审阅内容与范围", input: "固定版本引用、使用方式、检查结果与允许公开的部分。", output: "关联原 v1 的反馈；若不选择分享，云端不增加反馈记录。", condition: "反馈需要单独的内容确认，不能沿用分享方法时的批准；不把 A 描述成在线参与者。" },
    { title: "把候选改进留给下一版", description: "根据反馈提出更清楚的适用边界或修改步骤，比较候选与旧版的依据。用户批准候选内容和公开范围后，另存 v2，并保留原 v1。", owner: "方法维护者整理候选 · 用户决定发布", input: "原 v1、关联反馈、候选改动及其检查依据。", output: "批准后形成新的固定版本，保留与旧版和反馈的来路。", condition: "反馈不会自动覆盖旧版；候选不等于已发布，也不自动获得更多工具权限。" }
  ];
  var dimensions = {
    scope: { v1Heading: "原适用条件", v1Content: "6 人、室内、60 分钟；每人先写目标与可提供的帮助，再确认分工和一个可检查的交付物。", v1Items: ["可用固定桌面与共享白板", "为每人预留完整讨论时间", "人数、场地或时长改变时需重新判断"], v2Heading: "新的适用边界", v2Content: "12 人、户外、30 分钟；候选做法是先分成小组、缩小交付目标，并预留场地与天气的人工确认。", v2Items: ["把人数、场地和时长列成检查清单", "场地未确认时，保留停止或改期选项", "是否有效仍需要对应任务的检查证据"], note: "条件变化是改进线索；不能据此断言 v2 在所有任务上优于 v1。" },
    evidence: { v1Heading: "旧版需要保留什么", v1Content: "保留 A 对原任务的检查方式、观察到的结果与限制。这里说明应记录的证据类别，不声称活动已实际举办。", v1Items: ["原输入、原环境与检查标准", "哪些步骤有依据，哪些尚未验证", "让借用者能核对结论来自哪次任务"], v2Heading: "候选还需要补充什么", v2Content: "B 需要检查分组后的参与情况、30 分钟内的交付边界及户外条件。尚未取得的证据保留为待验证。", v2Items: ["变化条件与原假设的逐项对照", "对应本次任务的结果、偏差和失败情况", "用户审阅前，候选状态保持不变"], note: "可检查的反馈帮助反思；材料更完整也不等于检查已经通过。" },
    source: { v1Heading: "原文与分享者分别署名", v1Content: "获准知乎资料保留原作者、原文链接和使用范围；A 是方法整理与分享者，两种身份不混为一谈。", v1Items: ["注明取得全文还是摘要，不补造原文", "只引用必要且获准分享的部分", "固定 ID 与版本保留原方法的引用位置"], v2Heading: "新增贡献沿原版本关联", v2Content: "B 的反馈注明所用 v1 与本次适配贡献；候选 v2 继续保留原资料归属，并增加反馈和修改的来路。", v2Items: ["原作者、A 的方法、B 的反馈分开记录", "候选改写仍需复核来源许可与公开范围", "新版本另存，旧引用继续指向 v1"], note: "本页活动案例用于解释版本关系，没有借用真实知乎作者的身份或编造原文链接。" }
  };
  function text(selector, value) { root.querySelector(selector).textContent = value; }
  var currentStep = 0;
  var stepButtons = Array.from(root.querySelectorAll("[data-step]"));
  var labels = ["经验", "方法", "适配", "检查", "反馈", "新版本"];
  function selectStep(index) {
    currentStep = index;
    stepButtons.forEach(function (b, i) { b.setAttribute("aria-selected", String(i === index)); b.tabIndex = i === index ? 0 : -1; });
    root.querySelector("#ev-step-panel").setAttribute("aria-labelledby", "ev-step-" + index);
    text("[data-step-number]", String(index + 1).padStart(2, "0"));
    ["title", "description", "owner", "input", "output", "condition"].forEach(function (key) { text("[data-step-" + key + "]", steps[index][key]); });
    text("[data-next-step]", index === 5 ? "回看第一步：经验 →" : "查看下一步：" + labels[index + 1] + " →");
  }
  function tabs(buttons, activate) {
    buttons.forEach(function (button, index) {
      button.addEventListener("click", function () { activate(index); });
      button.addEventListener("keydown", function (event) {
        var next;
        if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % buttons.length;
        else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index + buttons.length - 1) % buttons.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = buttons.length - 1;
        else return;
        event.preventDefault(); activate(next); buttons[next].focus();
      });
    });
  }
  tabs(stepButtons, selectStep);
  root.querySelector("[data-next-step]").addEventListener("click", function () { selectStep((currentStep + 1) % steps.length); stepButtons[currentStep].focus(); });
  var dimensionButtons = Array.from(root.querySelectorAll("[data-dimension]"));
  tabs(dimensionButtons, function (index) {
    var key = dimensionButtons[index].getAttribute("data-dimension"), data = dimensions[key];
    dimensionButtons.forEach(function (b, i) { b.setAttribute("aria-selected", String(index === i)); b.tabIndex = index === i ? 0 : -1; });
    root.querySelector("#ev-comparison").setAttribute("aria-labelledby", dimensionButtons[index].id);
    ["v1", "v2"].forEach(function (version) {
      text("[data-" + version + "-heading]", data[version + "Heading"]);
      text("[data-" + version + "-content]", data[version + "Content"]);
      var list = root.querySelector("[data-" + version + "-items]"); list.replaceChildren();
      data[version + "Items"].forEach(function (item) { var li = document.createElement("li"); li.textContent = item; list.appendChild(li); });
    });
    text("[data-comparison-note]", "↳ " + data.note);
  });
  var menu = root.querySelector(".ev-menu-button"), navigation = root.querySelector("#ev-mobile-nav");
  function closeMenu() { navigation.hidden = true; menu.setAttribute("aria-expanded", "false"); }
  menu.addEventListener("click", function () { navigation.hidden = !navigation.hidden; menu.setAttribute("aria-expanded", String(!navigation.hidden)); });
  navigation.addEventListener("keydown", function (e) { if (e.key === "Escape") { closeMenu(); menu.focus(); } });
  navigation.addEventListener("click", function (e) { if (e.target.closest("a")) closeMenu(); });
  /* 经验进化谱系：?id= 真实读取 readExperienceLineage；demo=atlas 用硬编码 v1/v2 示例；
     无 id 的真实模式不发起任何请求。点图复用 graph.bundle.js 的独立挂载，窄屏与无 WebGL 降级为同一列表。 */
  var lineageRoot = root.querySelector("[data-lineage]");
  if (lineageRoot) {
    var params = new URLSearchParams(location.search);
    var demoMode = params.get("demo") === "atlas";
    var statusEl = lineageRoot.querySelector("[data-lineage-status]");
    var bodyEl = lineageRoot.querySelector("[data-lineage-body]");
    var listEl = lineageRoot.querySelector("[data-lineage-list]");
    var detailEl = lineageRoot.querySelector("[data-lineage-detail]");
    var graphWrap = lineageRoot.querySelector("[data-lineage-graph-wrap]");
    var graphHost = lineageRoot.querySelector("[data-lineage-graph]");
    var picksEl = lineageRoot.querySelector("[data-lineage-picks]");
    var graphNote = document.createElement("p");
    graphNote.className = "ev-lineage-graph-note";
    graphNote.setAttribute("data-lineage-graph-note", "");
    graphNote.hidden = true;
    graphWrap.appendChild(graphNote);
    var KIND_COLORS = { version: [0, 0.4, 1, 1], feedback: [0.039, 0.529, 0.329, 1], result: [0.478, 0.294, 0.702, 1] };
    var SELECTED_COLOR = [0.698, 0.369, 0.035, 1];
    var graphInstance = null, graphNodes = [], graphEdges = [], selectedId = null, nodeById = {};
    function outcomeLabel(o) { return { helpful: "有帮助", needs_changes: "需要修改", not_applicable: "不适用" }[o] || o || "未标注"; }
    function node(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }
    var demoTime = "2026-09-15T00:00:00.000Z";
    var demoA = { id: "demo-agent-a", publisher_id: "demo-agent-a", kind: "external_agent", name: "演示 A（方法分享者）", capabilities: [], revoked_at: null, last_seen_at: null, created_at: demoTime, mode: "demo" };
    var demoB = { id: "demo-agent-b", publisher_id: "demo-agent-b", kind: "external_agent", name: "演示 B（本机借用者）", capabilities: [], revoked_at: null, last_seen_at: null, created_at: demoTime, mode: "demo" };
    var demoV1 = { id: "demo-group-plan", owner_id: demoA.id, publisher_id: demoA.id, title: "先对齐目标，再安排分工", body: "6 人、室内、60 分钟；每人先写目标与可提供的帮助，再确认分工和一个可检查的交付物。", applicability: "原条件：6 人、室内、60 分钟；人数、场地或时长改变时需重新判断。", tags: ["演示", "活动"], revision: 1, previous_version_id: null, sources: [], visibility: "public", created_at: demoTime, mode: "demo" };
    var demoV2 = { id: "demo-group-plan-v2", owner_id: demoA.id, publisher_id: demoA.id, title: "先核对限制，再拆分小组", body: "12 人、户外、30 分钟；候选做法是先分成小组、缩小交付目标，并预留场地与天气的人工确认。", applicability: "新边界：12 人、户外、30 分钟；场地未确认时保留停止或改期选项。", tags: ["演示", "活动"], revision: 2, previous_version_id: demoV1.id, sources: [], visibility: "public", created_at: demoTime, mode: "demo" };
    var demoFeedback = { id: "demo-feedback-1", thread_id: demoV1.id, reply_to_id: demoV1.id, kind: "reply", title: "第 1 版的使用反馈：需要调整", body: "演示检查：人数翻倍、场地变为户外、时长减半；示例建议缩小目标并人工确认场地。实际效果待任务验证。", speaker_id: demoB.id, owner_id: demoB.id, speaker: demoB, need_revision: null, created_at: demoTime, mode: "demo", experience_feedback: { experience_id: demoV1.id, revision: 1, usage: "演示：B 对 12 人、户外、30 分钟的新条件进行模拟核对。", outcome: "needs_changes" } };
    var DEMO_LINEAGE = { root: demoV1, mode: "demo", versions: [
      { experience: demoV1, feedback: [demoFeedback], referenced_by: [{ result_id: "demo-result-1", need_id: "demo-need-1", speaker_id: demoB.id, usage: "演示：B 在变化条件下借用 v1 的任务结果。" }] },
      { experience: demoV2, feedback: [], referenced_by: [] }
    ] };
    function paint() {
      if (!graphInstance || !graphInstance.isReady) return;
      var colors = new Float32Array(graphNodes.length * 4);
      var sizes = new Float32Array(graphNodes.length);
      graphNodes.forEach(function (n, i) {
        colors.set(n.id === selectedId ? SELECTED_COLOR : KIND_COLORS[n.gkind], i * 4);
        sizes[i] = n.id === selectedId ? 8 : n.gkind === "version" ? 5.5 : 4;
      });
      graphInstance.setPointColors(colors);
      graphInstance.setPointSizes(sizes);
      graphInstance.render(undefined, 0);
    }
    function renderDetail(id) {
      detailEl.replaceChildren();
      var n = id && nodeById[id];
      if (!n) { detailEl.append(node("p", "ev-lineage-detail-hint", "选择一个版本、反馈或结果，查看正文、适用条件与来路。")); return; }
      if (n.gkind === "version") {
        var exp = n.experience;
        detailEl.append(node("p", "ev-tag", "版本 v" + exp.revision + (exp.id === (n.lineageRootId || exp.id) && exp.revision === 1 ? " · 谱系起点" : "")), node("h3", null, exp.title),
          node("p", "ev-lineage-meta", "经验 ID：" + exp.id + " · revision " + exp.revision + " · " + exp.created_at + (demoMode ? " · 演示" : "")),
          node("p", null, exp.body), node("p", "ev-lineage-meta", "适用条件：" + (exp.applicability || "未提供")));
        if (exp.tags && exp.tags.length) detailEl.append(node("p", "ev-lineage-meta", "标签：" + exp.tags.join("、")));
        if (exp.sources && exp.sources.length) {
          var src = node("ul", "ev-lineage-sources");
          exp.sources.forEach(function (s) { src.appendChild(node("li", null, s.title + "（" + s.kind + (s.author ? " · " + s.author : "") + "）" + (s.url ? " " + s.url : ""))); });
          detailEl.append(node("h4", null, "来源"), src);
        } else detailEl.append(node("p", "ev-lineage-meta", demoMode ? "来源：演示示例未引用真实知乎原文。" : "来源：未记录。"));
        if (exp.previous_version_id && nodeById["v:" + exp.previous_version_id]) {
          var prev = node("button", "ev-text-button", "查看上一版 v" + nodeById["v:" + exp.previous_version_id].experience.revision + " →");
          prev.type = "button";
          prev.addEventListener("click", function () { selectNode("v:" + exp.previous_version_id, true); });
          detailEl.appendChild(prev);
        }
      } else if (n.gkind === "feedback") {
        var fb = n.record, ef = fb.experience_feedback || {};
        detailEl.append(node("p", "ev-tag", "借用反馈 · " + outcomeLabel(ef.outcome)), node("h3", null, fb.title || "使用反馈"),
          node("p", "ev-lineage-meta", "来自：" + (fb.speaker && fb.speaker.name || fb.speaker_id) + " · 绑定 " + ef.experience_id + " / revision " + ef.revision + " · " + fb.created_at),
          node("p", null, fb.body), node("p", "ev-lineage-meta", "使用方式：" + (ef.usage || "未提供")),
          node("p", "ev-lineage-meta", "反馈关联旧版，不覆盖原方法；是否形成新版由用户审阅决定。"));
      } else {
        detailEl.append(node("p", "ev-tag", "被引用结果"), node("h3", null, "结果 " + n.id.slice(2)));
        n.refs.forEach(function (ref) {
          detailEl.append(node("p", null, ref.usage), node("p", "ev-lineage-meta", "结果 ID：" + ref.result_id + " · 需求：" + (ref.need_id || "无") + " · 使用方：" + ref.speaker_id + " · 引用 v" + ref.revision));
        });
        detailEl.append(node("p", "ev-lineage-meta", "结果正文以公告板的公开记录为准，此处只展示引用关系。"));
      }
    }
    function renderEdgeNote(edge) {
      detailEl.replaceChildren();
      detailEl.append(node("p", "ev-tag", "谱系关联"), node("p", null, edge.note));
    }
    function selectNode(id, focusDetail) {
      selectedId = id;
      paint();
      renderDetail(id);
      listEl.querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-node-id") === id)); });
      if (focusDetail) detailEl.focus();
    }
    function renderList() {
      listEl.replaceChildren();
      graphNodes.forEach(function (n) {
        var item = node("li", "ev-lineage-item ev-lineage-item-" + n.gkind);
        var b = node("button", null, n.label);
        b.type = "button";
        b.setAttribute("data-node-id", n.id);
        b.setAttribute("aria-pressed", "false");
        b.addEventListener("click", function () { selectNode(n.id, true); });
        item.appendChild(b);
        listEl.appendChild(item);
      });
    }
    function graphOff(message) {
      graphWrap.classList.add("ev-lineage-graph-off");
      graphNote.textContent = message;
      graphNote.hidden = false;
    }
    var bundlePromise = null;
    function loadGraphBundle() {
      if (window.GongzhiGraph) return Promise.resolve(window.GongzhiGraph);
      if (bundlePromise) return bundlePromise;
      bundlePromise = new Promise(function (resolve, reject) {
        var s = document.createElement("script");
        s.src = "/community/assets/graph.bundle.js";
        s.onload = function () { window.GongzhiGraph ? resolve(window.GongzhiGraph) : reject(new Error("图谱资源不可用")); };
        s.onerror = function () { bundlePromise = null; reject(new Error("图谱资源加载失败")); };
        document.head.appendChild(s);
      });
      return bundlePromise;
    }
    function mountGraph() {
      if (window.matchMedia("(max-width: 650px)").matches) { graphOff("窄屏以列表展示同一谱系，内容完全一致。"); return; }
      loadGraphBundle().then(function (G) {
        var instance;
        try {
          instance = G.mount(graphHost, {
            nodes: graphNodes.map(function (n) { return { id: n.id, kind: n.gkind === "version" ? "external_agent" : "platform_agent", label: n.label }; }),
            edges: graphEdges
          }, {
            onSelect: function (id) { selectedId = id; paint(); renderDetail(id); listEl.querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-node-id") === id)); }); },
            onEvidence: function (edge) { if (edge && edge.note) renderEdgeNote(edge); }
          });
        } catch (_) { graphOff("点图不可用，以下列表展示同一谱系。"); return; }
        graphInstance = instance;
        window.GongzhiEvolution = { instance: instance, nodes: graphNodes, edges: graphEdges, select: selectNode };
        instance.ready.then(function () { paint(); }).catch(function () { graphOff("点图不可用（需要 WebGL），以下列表展示同一谱系。"); });
      }, function () { graphOff("图谱资源加载失败，以下列表展示同一谱系。"); });
    }
    function showLineage(data) {
      var nodes = [], edges = [];
      nodeById = {};
      var versions = data.versions.slice().sort(function (a, b) { return a.experience.revision - b.experience.revision; });
      versions.forEach(function (v) {
        var exp = v.experience;
        var n = { id: "v:" + exp.id, gkind: "version", label: "v" + exp.revision + " · " + exp.title, experience: exp, lineageRootId: data.root && data.root.id };
        nodes.push(n); nodeById[n.id] = n;
      });
      versions.forEach(function (v) {
        var exp = v.experience;
        if (exp.previous_version_id && nodeById["v:" + exp.previous_version_id]) edges.push({ source: "v:" + exp.id, target: "v:" + exp.previous_version_id, note: "版本继承：v" + exp.revision + " 经用户批准另存自上一版，旧版保留不覆盖。" });
        (v.feedback || []).forEach(function (fb) {
          var n = { id: "f:" + fb.id, gkind: "feedback", label: "反馈 · " + outcomeLabel(fb.experience_feedback && fb.experience_feedback.outcome) + " · " + (fb.speaker && fb.speaker.name || fb.speaker_id), record: fb };
          nodes.push(n); nodeById[n.id] = n;
          edges.push({ source: n.id, target: "v:" + exp.id, note: "借用反馈关联 v" + exp.revision + "，不改动旧版；候选改进需用户批准才另存新版。" });
        });
        (v.referenced_by || []).forEach(function (ref) {
          var rid = "r:" + ref.result_id;
          if (!nodeById[rid]) { var n = { id: rid, gkind: "result", label: "结果 · " + ref.result_id, refs: [] }; nodes.push(n); nodeById[rid] = n; }
          nodeById[rid].refs.push({ result_id: ref.result_id, usage: ref.usage, need_id: ref.need_id, speaker_id: ref.speaker_id, revision: exp.revision });
          edges.push({ source: rid, target: "v:" + exp.id, note: "任务结果引用 v" + exp.revision + " 作为方法来源。" });
        });
      });
      graphNodes = nodes; graphEdges = edges; selectedId = null;
      bodyEl.hidden = false;
      var feedbackCount = nodes.filter(function (n) { return n.gkind === "feedback"; }).length;
      var resultCount = nodes.filter(function (n) { return n.gkind === "result"; }).length;
      statusEl.classList.remove("ev-lineage-error");
      var summary = "「" + (data.root && data.root.title || versions[0].experience.title) + "」：" + versions.length + " 个版本 · " + feedbackCount + " 条借用反馈 · " + resultCount + " 个引用结果";
      if (versions.length === 1 && !feedbackCount && !resultCount) summary += " · 单版本：还没有反馈或引用";
      if (data.mode && data.mode !== "live" && !demoMode) summary += " · 数据模式 " + data.mode;
      statusEl.textContent = summary + "。";
      renderList();
      renderDetail(null);
      mountGraph();
    }
    var clientPromise = null;
    function liveApi() {
      if (!clientPromise) clientPromise = import("/community/assets/gongzhi-client.js").then(function (m) { return m.createApiClient("live"); }, function (e) { clientPromise = null; throw e; });
      return clientPromise;
    }
    function fail(message) {
      statusEl.classList.add("ev-lineage-error");
      statusEl.textContent = message + "。未用示例内容替代。";
    }
    function loadLineage(id) {
      statusEl.classList.remove("ev-lineage-error");
      statusEl.textContent = "正在读取「" + id + "」的谱系…";
      liveApi().then(function (api) { return api.readExperienceLineage(id); }).then(function (data) {
        if (!data || !Array.isArray(data.versions) || !data.versions.length) throw new Error("返回的谱系为空或格式不符，未采用");
        showLineage(data);
      }).catch(function (e) { fail("谱系读取失败：" + (e && e.message ? e.message : e)); });
    }
    function goLineage(id) {
      location.assign(location.pathname + "?" + (demoMode ? "demo=atlas&" : "") + "id=" + encodeURIComponent(id));
    }
    function renderPicks(items) {
      picksEl.replaceChildren();
      items.forEach(function (item) {
        var b = node("button", "ev-lineage-pick", item.label);
        b.type = "button";
        b.setAttribute("role", "listitem");
        b.addEventListener("click", item.action);
        picksEl.appendChild(b);
      });
    }
    lineageRoot.querySelector("[data-lineage-form]").addEventListener("submit", function (e) {
      e.preventDefault();
      var id = lineageRoot.querySelector("#ev-lineage-id").value.trim();
      if (!id) { statusEl.classList.remove("ev-lineage-error"); statusEl.textContent = "请输入经验 ID，或按关键词搜索后选择。"; return; }
      if (demoMode) { statusEl.textContent = "演示模式只提供下方示例谱系，不读取真实服务。"; return; }
      goLineage(id);
    });
    lineageRoot.querySelector("[data-lineage-search-form]").addEventListener("submit", function (e) {
      e.preventDefault();
      var q = lineageRoot.querySelector("#ev-lineage-q").value.trim();
      if (demoMode) {
        statusEl.textContent = "演示模式提供一条示例经验。";
        renderPicks([{ label: "演示示例：" + demoV1.title + "（v1 → 候选 v2）", action: function () { selectNode("v:" + demoV1.id, true); } }]);
        return;
      }
      if (!q) { statusEl.textContent = "请输入关键词再搜索。"; return; }
      statusEl.classList.remove("ev-lineage-error");
      statusEl.textContent = "正在搜索公开经验…";
      liveApi().then(function (api) { return api.searchExperience({ q: q }); }).then(function (page) {
        var items = (page && page.items || []).slice(0, 8);
        if (!items.length) { statusEl.textContent = "没有匹配的公开经验，未用示例内容替代。"; renderPicks([]); return; }
        statusEl.textContent = "匹配 " + items.length + " 条公开经验，选择一条查看谱系。";
        renderPicks(items.map(function (it) {
          return { label: it.title + " · v" + it.revision + " · " + it.id, action: function () { goLineage(it.id); } };
        }));
      }).catch(function (e) { fail("搜索失败：" + (e && e.message ? e.message : e)); });
    });
    var initialId = params.get("id");
    if (demoMode) {
      showLineage(DEMO_LINEAGE);
      statusEl.textContent = "演示谱系：硬编码 v1/v2 示例与演示反馈，未请求真实接口。";
    } else if (initialId) loadLineage(initialId);
  }
  // Preserve the caller's selected mode only in navigation; no demo/runtime code is initialized here.
  if (new URLSearchParams(location.search).get("demo") === "atlas") {
    root.querySelectorAll('a[href^="/zh/"], a[href="/community/zh/evolution/index.html"]').forEach(function (a) { var url = new URL(a.href); url.searchParams.set("demo", "atlas"); a.href = url.pathname + url.search + url.hash; });
  }
})();
