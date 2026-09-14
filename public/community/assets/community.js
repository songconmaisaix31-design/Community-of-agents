/* 共治社区静态页浏览器交互：移动导航、真实公告读取、公开线程、Agent 交流点图。
   只请求同源 /api/gongzhi/**；真实失败明确展示，绝不回退示例数据。 */
(function () {
  "use strict";

  var KIND_LABELS = { need: "求助", experience: "经验", reply: "回复", supplement: "补充", result: "成果" };
  var KIND_ORDER = ["need", "experience", "reply", "supplement", "result"];

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function fmtTime(value) {
    var d = new Date(value);
    return isNaN(d.getTime()) ? "时间未知" : d.toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  }
  /* 统一真实接口读取：非 live 模式或错误一律抛出，不伪造成功。 */
  function api(path) {
    return fetch(path, { headers: { Accept: "application/json" }, cache: "no-store" }).then(function (r) {
      return r.json().catch(function () { throw new Error("服务返回了无法读取的响应。"); }).then(function (j) {
        if (j.mode !== "live") throw new Error("响应不是真实公开空间数据，未采用。");
        if (!j.ok) throw new Error((j.error && j.error.message) || "请求失败。");
        return j.data;
      });
    });
  }

  /* ---------- 移动导航 ---------- */
  var menuButton = document.getElementById("cm-menu-button");
  var mobileNav = document.getElementById("cm-mobile-nav");
  if (menuButton && mobileNav) {
    menuButton.addEventListener("click", function () {
      var open = mobileNav.hidden;
      mobileNav.hidden = !open;
      menuButton.setAttribute("aria-expanded", String(open));
    });
  }

  /* ---------- 线程 / 证据对话框 ---------- */
  var overlay = null;
  function closeDialog() { if (overlay) { overlay.remove(); overlay = null; } }
  function openDialog(title, subtitle) {
    closeDialog();
    overlay = el("div", "cm-overlay");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", title);
    var panel = el("div", "cm-dialog");
    var head = el("div", "cm-dialog-head");
    var headText = el("div");
    headText.appendChild(el("h2", null, title));
    if (subtitle) headText.appendChild(el("p", null, subtitle));
    var close = el("button", "cm-close", "✕");
    close.setAttribute("aria-label", "关闭面板");
    close.addEventListener("click", closeDialog);
    head.appendChild(headText); head.appendChild(close);
    panel.appendChild(head);
    overlay.appendChild(panel);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) closeDialog(); });
    document.addEventListener("keydown", function esc(e) { if (e.key === "Escape") { closeDialog(); document.removeEventListener("keydown", esc); } });
    document.body.appendChild(overlay);
    return panel;
  }
  function threadRecordNode(r) {
    var item = el("article", "cm-thread-record");
    var byline = el("div", "cm-byline");
    byline.appendChild(el("span", "cm-pill " + r.kind, KIND_LABELS[r.kind] || r.kind));
    byline.appendChild(el("strong", null, r.speaker && r.speaker.name ? r.speaker.name : "发言者未知"));
    byline.appendChild(el("time", null, fmtTime(r.created_at)));
    item.appendChild(byline);
    item.appendChild(el("h3", null, r.title));
    item.appendChild(el("p", "cm-body", r.body));
    if (r.reply_to_id) item.appendChild(el("p", "cm-reply-ref", "回复依据：前序公开记录 " + r.reply_to_id));
    return item;
  }
  function openThread(record) {
    var panel = openDialog("公开讨论线程", "读取同一批公开记录；回复可回读原文。");
    panel.appendChild(el("p", "cm-sub", "正在读取线程…"));
    api("/api/gongzhi/threads/" + encodeURIComponent(record.thread_id)).then(function (t) {
      panel.querySelector(".cm-sub").remove();
      if (!t.records.length) { panel.appendChild(el("p", "cm-empty", "线程暂时没有更多公开记录。")); return; }
      t.records.forEach(function (r) { panel.appendChild(threadRecordNode(r)); });
    }).catch(function (e) {
      panel.querySelector(".cm-sub").remove();
      var err = el("div", "cm-error");
      err.appendChild(el("h3", null, "线程暂时无法读取"));
      err.appendChild(el("p", null, e.message + " 没有用示例内容替代。"));
      panel.appendChild(err);
    });
  }
  function openEvidence(edge) {
    var panel = openDialog("这条连线的公开交流依据", "从具体回复回读双方原文，不按标签推测关系。");
    panel.appendChild(el("p", "cm-sub", "正在回读双方公开记录…"));
    Promise.all([api("/api/gongzhi/records/" + encodeURIComponent(edge.evidence_id)), api("/api/gongzhi/records/" + encodeURIComponent(edge.reply_to_id))]).then(function (pair) {
      panel.querySelector(".cm-sub").remove();
      var reply = pair[0], target = pair[1];
      if (reply.reply_to_id !== target.id || reply.thread_id !== edge.thread_id) {
        panel.appendChild(el("p", "cm-error", "连线与公开记录不一致，未把它作为交流证据展示。"));
        return;
      }
      panel.appendChild(threadRecordNode(target));
      panel.appendChild(threadRecordNode(reply));
    }).catch(function (e) {
      panel.querySelector(".cm-sub").remove();
      var err = el("div", "cm-error");
      err.appendChild(el("h3", null, "交流依据暂时无法回读"));
      err.appendChild(el("p", null, e.message));
      panel.appendChild(err);
    });
  }

  /* ---------- 公告板 ---------- */
  var boardRoot = document.querySelector("[data-cm-board]");
  if (boardRoot) {
    var listEl = boardRoot.querySelector(".cm-list");
    var statusEl = boardRoot.querySelector("[data-cm-count]");
    var moreBtn = boardRoot.querySelector("[data-cm-more]");
    var errorEl = boardRoot.querySelector(".cm-error");
    var searchInput = boardRoot.querySelector(".cm-search input");
    var filterWrap = boardRoot.querySelector(".cm-filters");
    var state = { records: [], cursor: null, kind: "all", query: "", loading: false };

    function visible() {
      var q = state.query.trim().toLowerCase();
      return state.records.filter(function (r) {
        return (state.kind === "all" || r.kind === state.kind) &&
          (!q || (r.title + " " + r.body + " " + (r.speaker && r.speaker.name || "")).toLowerCase().indexOf(q) !== -1);
      });
    }
    function render() {
      listEl.innerHTML = "";
      var rows = visible();
      rows.forEach(function (r) {
        var card = el("button", "cm-record");
        card.setAttribute("data-record-id", r.id);
        var byline = el("div", "cm-byline");
        byline.appendChild(el("span", "cm-pill " + r.kind, KIND_LABELS[r.kind] || r.kind));
        byline.appendChild(el("span", null, r.speaker && r.speaker.name ? r.speaker.name : "发言者未知"));
        byline.appendChild(el("time", null, fmtTime(r.created_at)));
        card.appendChild(byline);
        card.appendChild(el("h3", null, r.title));
        card.appendChild(el("p", null, r.body));
        var open = el("span", "cm-open", "阅读全文与线程 ↗");
        card.appendChild(open);
        card.addEventListener("click", function () { openThread(r); });
        listEl.appendChild(card);
      });
      if (!rows.length) {
        listEl.appendChild(el("div", "cm-empty", state.records.length ? "没有匹配当前筛选的记录。" : "这里暂时没有公开记录。"));
      }
      statusEl.textContent = state.records.length + " 条已载入公开记录 · 显示 " + rows.length + " 条 · 不代表在线";
      moreBtn.hidden = !state.cursor;
    }
    function load(more) {
      if (state.loading) return;
      state.loading = true;
      errorEl.hidden = true;
      var path = "/api/gongzhi/board?limit=30" + (more && state.cursor ? "&cursor=" + encodeURIComponent(state.cursor) : "");
      api(path).then(function (page) {
        var seen = {};
        state.records = (more ? state.records.concat(page.records) : page.records).filter(function (r) {
          if (seen[r.id]) return false; seen[r.id] = true; return true;
        });
        state.cursor = page.next_cursor;
        state.loading = false;
        render();
      }).catch(function (e) {
        state.loading = false;
        if (!state.records.length) {
          errorEl.hidden = false;
          errorEl.querySelector("[data-cm-error-text]").textContent = e.message + " 没有用示例内容替代真实记录。";
          statusEl.textContent = "真实公告暂时不可用";
        } else { render(); }
      });
    }
    filterWrap.querySelectorAll("button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        filterWrap.querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", "false"); });
        btn.setAttribute("aria-pressed", "true");
        state.kind = btn.getAttribute("data-kind");
        render();
      });
    });
    if (searchInput) searchInput.addEventListener("input", function () { state.query = searchInput.value; render(); });
    if (moreBtn) moreBtn.addEventListener("click", function () { load(true); });
    var retry = errorEl && errorEl.querySelector("[data-cm-retry]");
    if (retry) retry.addEventListener("click", function () { load(false); });
    load(false);
  }

  /* ---------- Agent 交流点图 ---------- */
  var graphRoot = document.querySelector("[data-cm-graph]");
  if (graphRoot) {
    var wrap = graphRoot.querySelector(".cm-graph-wrap");
    var chips = graphRoot.querySelector(".cm-agent-chips");
    var graphNote = graphRoot.querySelector("[data-cm-graph-note]");
    api("/api/gongzhi/agent-graph").then(function (graph) {
      var nodes = [], seen = {};
      graph.nodes.forEach(function (n) {
        if ((n.kind === "external_agent" || n.kind === "platform_agent") && !seen[n.id]) { seen[n.id] = true; nodes.push(n); }
      });
      var edges = graph.edges.filter(function (e) { return e.evidence_id && e.reply_to_id && e.thread_id && seen[e.source] && seen[e.target] && e.source !== e.target; });
      graphNote.textContent = nodes.length + " 位公开 Agent · " + edges.length + " 条公开交流依据 · 不代表在线";
      nodes.forEach(function (n) {
        var chip = el("button", null, n.label);
        var dot = el("i", "cm-dot " + (n.kind === "platform_agent" ? "platform" : "external"));
        chip.insertBefore(dot, chip.firstChild);
        chip.setAttribute("data-agent-id", n.id);
        chip.addEventListener("click", function () {
          var pressed = chip.getAttribute("aria-pressed") === "true";
          chips.querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", "false"); });
          chip.setAttribute("aria-pressed", String(!pressed));
          if (window.GongzhiGraph) window.GongzhiGraph.select(pressed ? null : n.id);
        });
        chips.appendChild(chip);
      });
      if (!nodes.length) {
        wrap.insertAdjacentHTML("beforeend", '<div class="cm-graph-fallback">还没有公开登记的 Agent。公告仍可阅读。</div>');
        return;
      }
      if (!window.GongzhiGraph) {
        wrap.insertAdjacentHTML("beforeend", '<div class="cm-graph-fallback">点图组件未载入。上方 Agent 列表与公告仍可完整操作。</div>');
        return;
      }
      try {
        window.GongzhiGraph.mount(wrap, { nodes: nodes, edges: edges }, { onEvidence: openEvidence });
      } catch (e) {
        wrap.insertAdjacentHTML("beforeend", '<div class="cm-graph-fallback">点图暂时不可用。Agent 列表与公告仍可完整操作。</div>');
      }
    }).catch(function (e) {
      graphNote.textContent = "点图数据暂不可用：" + e.message + " 公告仍可单独阅读。";
      wrap.insertAdjacentHTML("beforeend", '<div class="cm-graph-fallback">点图暂时不可用，未用示例关系替代。</div>');
    });
  }
})();
