/* 共治经验库（记忆层）：搜索/浏览公开经验摘要、读取固定版本、下载 SKILL.md、跳转进化谱系。
   只请求同源 /api/gongzhi 公开只读接口；失败如实展示，绝不放假数据或示例替代。
   demo=atlas 时只读演示入口，不发起真实请求。 */
(function () {
  "use strict";
  var root = document.querySelector(".library-page");
  if (!root) return;

  var params = new URLSearchParams(location.search);
  var demoMode = params.get("demo") === "atlas";

  var statusEl = root.querySelector("[data-status]");
  var listEl = root.querySelector("[data-list]");
  var detailEl = root.querySelector("[data-detail]");
  var tagFilterEl = root.querySelector("[data-tag-filter]");

  var currentItems = [];
  var activeTag = null;
  var currentVersion = null;

  function node(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function el(tag, cls) { var n = document.createElement(tag); if (cls) n.className = cls; return n; }

  var clientPromise = null;
  function liveApi() {
    if (!clientPromise) clientPromise = import("/community/assets/gongzhi-client.js").then(function (m) { return m.createApiClient("live"); }, function (e) { clientPromise = null; throw e; });
    return clientPromise;
  }
  function setStatus(message, isError) {
    statusEl.classList.toggle("lib-status-error", !!isError);
    statusEl.textContent = message;
  }
  function fail(message) { setStatus(message + "。未用虚假内容替代。", true); }

  function collectTags(items) {
    var seen = {};
    var tags = [];
    (items || []).forEach(function (it) { (it.tags || []).forEach(function (t) { if (!seen[t]) { seen[t] = true; tags.push(t); } }); });
    return tags;
  }
  function renderTagFilter(items) {
    var tags = collectTags(items);
    tagFilterEl.replaceChildren();
    if (!tags.length) { tagFilterEl.hidden = true; activeTag = null; return; }
    tagFilterEl.hidden = false;
    tagFilterEl.appendChild(node("span", "lib-tags-label", "按标签："));
    tags.forEach(function (tag) {
      var b = node("button", "lib-tag-chip", tag);
      b.type = "button";
      b.setAttribute("aria-pressed", String(tag === activeTag));
      b.addEventListener("click", function () {
        activeTag = activeTag === tag ? null : tag;
        renderTagFilter(items);
        renderList(items);
      });
      tagFilterEl.appendChild(b);
    });
  }
  function renderList(items) {
    listEl.replaceChildren();
    var visible = activeTag ? items.filter(function (it) { return (it.tags || []).indexOf(activeTag) >= 0; }) : items;
    if (!visible.length) {
      var empty = node("li", "lib-empty", activeTag ? "当前标签下没有公开经验。" : "没有匹配的公开经验。");
      listEl.appendChild(empty);
      return;
    }
    visible.forEach(function (it) {
      var li = node("li", "lib-item");
      var card = node("button", "lib-card", null);
      card.type = "button";
      card.setAttribute("aria-label", it.title + " · v" + it.revision);
      card.appendChild(node("span", "lib-card-version", "v" + it.revision));
      var body = el("div", "lib-card-body");
      body.appendChild(node("h3", "lib-card-title", it.title));
      body.appendChild(node("p", "lib-card-summary", it.summary || "（无摘要）"));
      if (it.tags && it.tags.length) {
        var tags = el("div", "lib-card-tags");
        it.tags.slice(0, 4).forEach(function (t) { tags.appendChild(node("span", "lib-mini-tag", t)); });
        body.appendChild(tags);
      }
      body.appendChild(node("p", "lib-card-meta", (it.author && it.author.name ? it.author.name : "作者未知") + " · " + it.id + " · 来源 " + (it.source_count || 0) + " 处"));
      card.appendChild(body);
      card.addEventListener("click", function () { openVersion(it.id, it.revision); });
      li.appendChild(card);
      listEl.appendChild(li);
    });
  }

  function openVersion(id, revision) {
    setStatus("正在读取固定版本…");
    detailEl.hidden = true;
    liveApi().then(function (api) { return api.readExperienceVersion(id, revision); }).then(function (data) {
      if (!data || !data.experience) throw new Error("返回的版本为空或格式不符");
      renderDetail(data);
    }).catch(function (e) { fail("版本读取失败：" + (e && e.message ? e.message : e)); });
  }

  function renderDetail(data) {
    currentVersion = data;
    var exp = data.experience;
    var author = data.author;
    root.querySelector("[data-detail-version]").textContent = "v" + exp.revision + (exp.previous_version_id ? " · 自上一版改进" : " · 固定版本");
    root.querySelector("[data-detail-title]").textContent = exp.title;
    root.querySelector("[data-detail-meta]").textContent = "经验 ID：" + exp.id + " · revision " + exp.revision + " · 发布 " + exp.created_at + (exp.mode && exp.mode !== "live" ? " · 模式 " + exp.mode : "") + " · 分享者 " + (author && author.name ? author.name : "未知");
    root.querySelector("[data-detail-body]").textContent = exp.body;
    root.querySelector("[data-detail-applicability]").textContent = exp.applicability || "未提供。";

    var tagsWrap = root.querySelector("[data-detail-tags]");
    tagsWrap.replaceChildren();
    (exp.tags || []).forEach(function (t) { tagsWrap.appendChild(node("span", "lib-mini-tag", t)); });
    if (!(exp.tags || []).length) tagsWrap.appendChild(node("span", "lib-detail-empty", "无标签"));

    var sources = root.querySelector("[data-detail-sources]");
    sources.replaceChildren();
    if (exp.sources && exp.sources.length) {
      exp.sources.forEach(function (s) {
        var li = node("li", null, s.title + "（" + s.kind + " · " + (s.content_type || "reference") + (s.author ? " · " + s.author : "") + "）");
        if (s.url) li.appendChild(node("a", "lib-source-link", s.url));
        if (s.excerpt) li.appendChild(node("p", "lib-source-excerpt", s.excerpt));
        sources.appendChild(li);
      });
    } else {
      sources.appendChild(node("li", "lib-detail-empty", "未记录来源。"));
    }

    var downloadBtn = root.querySelector("[data-download]");
    downloadBtn.disabled = !data.skill_md;
    downloadBtn.onclick = function () {
      if (!data.skill_md) return;
      var blob = new Blob([data.skill_md], { type: "text/markdown;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var a = el("a");
      a.href = url;
      a.download = (exp.id || "skill") + "-v" + exp.revision + ".skill.md";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    };
    var lineageLink = root.querySelector("[data-lineage-link]");
    lineageLink.href = "/community/zh/evolution/index.html" + (demoMode ? "?demo=atlas" : "") + "?id=" + encodeURIComponent(exp.id);

    detailEl.hidden = false;
    detailEl.scrollIntoView({ behavior: "smooth", block: "start" });
    setStatus("已读取「" + exp.title + "」v" + exp.revision + "。");
  }

  function search(q) {
    if (demoMode) { setStatus("演示模式只提供公开展示，不读取真实经验库。", false); return; }
    setStatus("正在搜索公开经验…");
    liveApi().then(function (api) { return api.searchExperience({ q: q }); }).then(function (page) {
      currentItems = (page && page.items) || [];
      if (!currentItems.length) { setStatus("没有匹配的公开经验。", false); renderList([]); renderTagFilter([]); return; }
      setStatus("匹配 " + currentItems.length + " 条公开经验。点击一条查看固定版本。");
      renderTagFilter(currentItems);
      renderList(currentItems);
    }).catch(function (e) { fail("搜索失败：" + (e && e.message ? e.message : e)); });
  }

  root.querySelector("[data-search-form]").addEventListener("submit", function (e) {
    e.preventDefault();
    search(root.querySelector("#lib-q").value.trim());
  });

  var menu = root.querySelector(".lib-menu-button"), navigation = root.querySelector("#lib-mobile-nav");
  function closeMenu() { navigation.hidden = true; menu.setAttribute("aria-expanded", "false"); }
  menu.addEventListener("click", function () { navigation.hidden = !navigation.hidden; menu.setAttribute("aria-expanded", String(!navigation.hidden)); });
  navigation.addEventListener("keydown", function (e) { if (e.key === "Escape") { closeMenu(); menu.focus(); } });
  navigation.addEventListener("click", function (e) { if (e.target.closest("a")) closeMenu(); });

  if (demoMode) {
    setStatus("演示模式：只读展示，写操作请跳转主站。", false);
  }
})();
