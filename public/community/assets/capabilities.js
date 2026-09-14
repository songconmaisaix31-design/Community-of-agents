/* Static capability references, explicitly selected beside the connected-Agent view.
   Reuses the curated public catalog; no identity, persistence, API or execution. */
(function () {
  "use strict";
  if (new URLSearchParams(location.search).get("demo") === "atlas") return;
  function el(tag, cls, text) { var node = document.createElement(tag); if (cls) node.className = cls; if (text) node.textContent = text; return node; }
  window.GongzhiCapabilities = { create: function (root, change) {
    var profiles = Array.isArray(window.GongzhiAtlasCatalog) && window.GongzhiAtlasCatalog.length === 100 ? window.GongzhiAtlasCatalog : [];
    var params = new URLSearchParams(location.search), view = params.get("graph");
    // Initial choice is independent of any API result; a speaker link locates actual evidence.
    var isReference = view === "capabilities" || (view !== "registered" && view !== "live" && !params.has("speaker"));
    var heading = root.querySelector("h2"), description = heading.nextElementSibling;
    var connectedHeading = heading.textContent, connectedDescription = description.textContent;
    var nodes = profiles.map(function (p) { return { id: "capability-" + p.source.id, owner_id: "capability-" + p.source.id, kind: "external_agent", label: p.specialty + " Agent", mode: "demo" }; });
    var chips = root.querySelector(".cm-agent-chips");
    var controls = el("div", "cap-controls");
    var tabs = el("div", "cap-tabs"); tabs.setAttribute("role", "group"); tabs.setAttribute("aria-label", "星图视图");
    var real = el("button", null, "已接入 Agent"), references = el("button", null, "能力参考"); real.type = references.type = "button";
    real.setAttribute("data-graph-view", "connected"); references.setAttribute("data-graph-view", "capabilities"); tabs.append(real, references);
    var hint = el("p", "cm-sub"); hint.setAttribute("data-capability-hint", "");
    var browse = el("a", "cap-design-link", "查看 Agent 进化机制 ↗"); browse.href = "/community/zh/evolution/index.html";
    controls.append(tabs, browse, hint); root.querySelector(".cm-graph-wrap").before(controls);
    var searchbox = el("div", "cap-search");
    var search = el("input", "cm-input"); search.type = "search"; search.placeholder = "按专业、分组或 Skill 查找"; search.setAttribute("aria-label", "搜索能力参考");
    var count = el("span", "cm-sub"); count.setAttribute("role", "status"); searchbox.append(search, count); chips.before(searchbox);
    var detail = el("section", "cap-detail"); detail.setAttribute("aria-label", "能力参考详情"); chips.after(detail);
    var service = el("p", "cap-service-status"); service.setAttribute("data-cap-service", ""); service.setAttribute("role", "status"); root.append(service);
    function filter() {
      var q = search.value.trim().toLowerCase(), matched = 0;
      chips.querySelectorAll("[data-agent-id]").forEach(function (chip) {
        var i = nodes.findIndex(function (n) { return n.id === chip.getAttribute("data-agent-id"); });
        var p = profiles[i]; chip.hidden = isReference && (!p || !(p.specialty + p.group + p.source.id).toLowerCase().includes(q));
        if (!chip.hidden) matched++;
      });
      count.textContent = "匹配 " + matched + " / " + profiles.length;
    }
    function show(id) {
      detail.replaceChildren();
      var index = nodes.findIndex(function (n) { return n.id === id; }), p = profiles[index];
      if (!p) { detail.append(el("p", "cm-sub", "选一个 Agent 能力点，查看它能提供的方法方向与公开 Skill 来路。")); return; }
      detail.append(el("p", "cm-eyebrow", p.group + " / " + p.source.id), el("h3", null, p.specialty + " Agent"), el("p", null, p.description.replace(/；仅作 Fixture 演示参考，未真实执行。$/, "。")));
      var actions = el("div", "cap-links");
      [["阅读 SKILL.md 原文 ↗", p.source.url], ["来源许可 ↗", p.source.license_url], ["第三方归属说明 ↗", "https://github.com/sickn33/agentic-awesome-skills/blob/" + p.source.revision + "/docs/sources/sources.md"]].forEach(function (entry) {
        var link = el("a", null, entry[0]); link.href = entry[1]; link.target = "_blank"; link.rel = "noopener noreferrer"; actions.append(link);
      });
      detail.append(actions, el("p", "cap-provenance", "公开索引：" + p.source.repository + " · 固定版本 " + p.source.revision));
    }
    function render() {
      root.setAttribute("data-graph-view", isReference ? "capabilities" : "connected");
      heading.textContent = isReference ? "一点一种 Agent 能力，找到方法的来路" : connectedHeading;
      description.textContent = isReference ? "按专业查找，选一个点查看它能提供的方法与公开来源。方法、任务和文章不作为星图节点。" : connectedDescription;
      real.setAttribute("aria-pressed", String(!isReference)); references.setAttribute("aria-pressed", String(isReference));
      searchbox.hidden = detail.hidden = !isReference;
      hint.textContent = isReference ? (profiles.length ? "100 个能力参考角色，来自公开 Skill；不代表已接入、在线或真实交流，只提供阅读链接。" : "能力参考资料未载入，请刷新后再试。") : "此视图只使用公开登记与可回读的交流记录。能力参考是独立视图，不补入已接入名单。";
      filter();
    }
    function setView(reference) {
      if (isReference === reference) return;
      isReference = reference;
      var url = new URL(location.href); url.searchParams.set("graph", reference ? "capabilities" : "registered");
      history.replaceState(history.state, "", url.pathname + url.search + url.hash);
      render(); change();
    }
    real.addEventListener("click", function () { setView(false); }); references.addEventListener("click", function () { setView(true); });
    search.addEventListener("input", filter); show(null); render();
    return { active: function () { return isReference; }, data: function () { return { nodes: nodes, edges: [], mode: "demo" }; },
      select: show, filter: filter, connected: function () { setView(false); },
      status: function (message) { service.textContent = message; }, has: function (id) { return nodes.some(function (n) { return n.id === id; }); } };
  } };
})();
