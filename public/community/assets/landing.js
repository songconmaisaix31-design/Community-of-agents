/* 共治首页落地层交互：接入面板 tabs + 打字机 + 复制、能力棋盘卡展开、
   公告板实时预览拉取、GSAP 浮卡入场。
   只请求同源 /api/gongzhi/board 公开只读接口；读取失败整卡隐藏，绝不放假数据。
   prefers-reduced-motion 全降级；无 GSAP 时静默降级为静态展示；所有副作用可清理。 */
(function () {
  "use strict";

  var root = document.querySelector("main.landing-root");
  if (!root) return;

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var desktop = window.matchMedia("(min-width: 901px)");
  var demoMode = new URLSearchParams(location.search).has("demo");

  /* ---------- 可清理副作用登记 ---------- */
  var removers = [];
  var timers = [];
  function on(node, ev, fn, opts) {
    if (!node) return;
    node.addEventListener(ev, fn, opts);
    removers.push(function () { node.removeEventListener(ev, fn, opts); });
  }
  function later(fn, ms) {
    var t = window.setTimeout(fn, ms);
    timers.push(t);
    return t;
  }
  function destroy() {
    removers.forEach(function (off) { off(); });
    timers.forEach(function (t) { window.clearTimeout(t); });
    if (boardState.typingFrame) window.cancelAnimationFrame(boardState.typingFrame);
  }
  window.__gongzhiLandingDestroy = destroy;
  on(window, "pagehide", destroy);

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  /* ---------- 1. Hero 接入面板：tabs + 打字机 + 复制 ---------- */
  var install = root.querySelector("[data-ln-install]");
  var boardState = { typingFrame: 0 };
  if (install) {
    var origin = location.origin;
    var modes = {
      agent: {
        title: "把这句话发给你的 Agent，它自己会读说明、自己接入",
        command: "帮我接入共治网络：先读 " + origin + "/agent-skill.md，按里面的说明来",
      },
      manual: {
        title: "MCP 地址（Streamable HTTP），Bearer 密钥由你的 Agent 宿主保管",
        guide: { text: "完整接入指南", href: "/zh/connect/" },
        command: origin + "/mcp",
      },
    };
    var tabs = Array.prototype.slice.call(install.querySelectorAll('[role="tab"]'));
    var titleEl = install.querySelector("[data-ln-install-title]");
    var commandEl = install.querySelector("[data-ln-install-command]");
    var commandRow = install.querySelector(".ln-command-row");
    var copyBtn = install.querySelector("[data-ln-copy]");
    var live = el("p", "ln-sr");
    live.setAttribute("aria-live", "polite");
    install.appendChild(live);
    function announce(msg) { live.textContent = ""; live.textContent = msg; }

    function renderTitle(mode) {
      titleEl.textContent = mode.title;
      if (mode.guide) {
        var a = el("a", "ln-link", mode.guide.text);
        a.href = mode.guide.href;
        titleEl.appendChild(a);
      }
    }
    function showCommand(value) {
      window.cancelAnimationFrame(boardState.typingFrame);
      commandEl.textContent = value;
      commandEl.setAttribute("aria-label", value);
      commandRow.classList.remove("is-typing", "is-preparing");
      var caret = commandRow.querySelector(".ln-command-caret");
      if (caret) caret.classList.remove("is-visible");
    }
    function typeCommand(value) {
      if (reduceMotion.matches) { showCommand(value); return; }
      var chars = Array.from(value);
      var startedAt = 0;
      commandEl.textContent = "";
      commandEl.setAttribute("aria-label", value);
      var caret = commandRow.querySelector(".ln-command-caret");
      // 准备阶段：光标先按 440/260、220/120、140/90 闪烁三次，再逐字打字（对齐 dws CLI 动效）
      var flashes = [{ on: 440, off: 260 }, { on: 220, off: 120 }, { on: 140, off: 90 }];
      var elapsed = 0;
      commandRow.classList.add("is-preparing");
      flashes.forEach(function (f) {
        later(function () { if (caret) caret.classList.add("is-visible"); }, elapsed);
        elapsed += f.on;
        later(function () { if (caret) caret.classList.remove("is-visible"); }, elapsed);
        elapsed += f.off;
      });
      later(function () {
        commandRow.classList.remove("is-preparing");
        commandRow.classList.add("is-typing");
        var duration = Math.min(2200, 600 + chars.length * 28);
        function frame(now) {
          if (!startedAt) startedAt = now;
          var p = Math.max(0, Math.min(1, (now - startedAt) / duration));
          commandEl.textContent = chars.slice(0, Math.floor(p * chars.length)).join("");
          if (p < 1) {
            boardState.typingFrame = window.requestAnimationFrame(frame);
          } else {
            commandEl.textContent = value;
            later(function () { commandRow.classList.remove("is-typing"); }, 360);
          }
        }
        boardState.typingFrame = window.requestAnimationFrame(frame);
      }, elapsed);
    }
    function selectTab(tab, focus) {
      tabs.forEach(function (t) {
        var active = t === tab;
        t.setAttribute("aria-selected", String(active));
        t.tabIndex = active ? 0 : -1;
      });
      renderTitle(modes[tab.getAttribute("data-ln-mode")]);
      showCommand(modes[tab.getAttribute("data-ln-mode")].command);
      if (focus) tab.focus();
    }
    tabs.forEach(function (tab, i) {
      on(tab, "click", function () { selectTab(tab, false); });
      on(tab, "keydown", function (e) {
        var next = null;
        if (e.key === "ArrowRight") next = tabs[(i + 1) % tabs.length];
        else if (e.key === "ArrowLeft") next = tabs[(i - 1 + tabs.length) % tabs.length];
        else if (e.key === "Home") next = tabs[0];
        else if (e.key === "End") next = tabs[tabs.length - 1];
        if (next) { e.preventDefault(); selectTab(next, true); }
      });
    });

    function fallbackCopy(text) {
      var ta = el("textarea", "ln-sr");
      ta.value = text;
      ta.setAttribute("readonly", "");
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      ta.remove();
      return ok;
    }
    on(copyBtn, "click", function () {
      var text = commandEl.textContent;
      function done(ok) {
        var old = copyBtn.textContent;
        copyBtn.textContent = ok ? "已复制 ✓" : "复制失败";
        announce(ok ? "已复制到剪贴板。" : "复制失败，请手动选择文本复制。");
        copyBtn.disabled = true;
        later(function () { copyBtn.textContent = old; copyBtn.disabled = false; }, 1600);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(fallbackCopy(text)); });
      } else {
        done(fallbackCopy(text));
      }
    });

    renderTitle(modes.agent);
    typeCommand(modes.agent.command);
  }

  /* ---------- 2. 能力棋盘卡：hover/点击/聚焦展开大卡（几何量走 CSS transition） ---------- */
  var board = root.querySelector("[data-ln-capboard]");
  var cards = board ? Array.prototype.slice.call(board.querySelectorAll("[data-ln-capcard]")) : [];
  if (board && cards.length) {
    var SMALL = 180, LARGE = 588, GAP = 24, ROW_STEP = 204, ROW_DELAY = 30, SHRINK_MS = 550;
    var activeIndex = -1;
    var currentLayout = [];
    var shrinkTimers = {};

    function computeLayout(active, wideColumn) {
      var lefts = [];
      var x = 0;
      for (var col = 0; col < 4; col += 1) { lefts[col] = x; x += GAP + (col === wideColumn ? LARGE : SMALL); }
      var narrow = [0, 1, 2, 3].filter(function (c) { return c !== wideColumn; });
      var layout = [];
      var slot = 0;
      cards.forEach(function (_, index) {
        if (index === active) {
          layout[index] = { column: wideColumn, row: 0, left: lefts[wideColumn], top: 0, size: LARGE };
          return;
        }
        var col = narrow[slot % 3];
        var row = Math.floor(slot / 3);
        layout[index] = { column: col, row: row, left: lefts[col], top: row * ROW_STEP, size: SMALL };
        slot += 1;
      });
      return layout;
    }
    function render() {
      cards.forEach(function (card, index) {
        var pos = currentLayout[index];
        var active = index === activeIndex;
        card.style.left = pos.left + "px";
        card.style.top = pos.top + "px";
        card.style.width = pos.size + "px";
        card.style.height = pos.size + "px";
        card.style.transitionDelay = (active ? 0 : pos.row * ROW_DELAY) + "ms";
        card.classList.toggle("is-active", active);
        card.setAttribute("aria-expanded", String(active));
      });
    }
    function clearInline() {
      cards.forEach(function (card, index) {
        card.style.left = "";
        card.style.top = "";
        card.style.width = "";
        card.style.height = "";
        card.style.transitionDelay = "";
        card.classList.toggle("is-active", index === activeIndex);
        card.setAttribute("aria-expanded", String(index === activeIndex));
      });
    }
    function activate(next) {
      if (next === activeIndex) return;
      var previous = activeIndex;
      if (desktop.matches) {
        var column = currentLayout[next] ? currentLayout[next].column : 0;
        currentLayout = computeLayout(next, column);
        if (shrinkTimers[next]) {
          window.clearTimeout(shrinkTimers[next]);
          delete shrinkTimers[next];
          cards[next].classList.remove("is-shrinking");
        }
        if (previous >= 0) {
          var shrinking = cards[previous];
          shrinking.classList.add("is-shrinking");
          if (shrinkTimers[previous]) window.clearTimeout(shrinkTimers[previous]);
          var delay = SHRINK_MS + currentLayout[previous].row * ROW_DELAY;
          shrinkTimers[previous] = later(function () {
            shrinking.classList.remove("is-shrinking");
            delete shrinkTimers[previous];
          }, delay);
        }
        activeIndex = next;
        render();
      } else {
        activeIndex = next;
        clearInline();
      }
    }
    cards.forEach(function (card, index) {
      on(card, "mouseenter", function () { if (desktop.matches) activate(index); });
      on(card, "focus", function () { activate(index); });
      on(card, "click", function () { activate(index); });
    });
    function initLayout() {
      if (!desktop.matches) { clearInline(); return; }
      board.classList.add("no-transition");
      activeIndex = 0;
      currentLayout = computeLayout(0, 0);
      render();
      void board.offsetWidth;
      board.classList.remove("no-transition");
    }
    initLayout();
    on(desktop, "change", initLayout);
  }

  /* ---------- 3. FAQ 手风琴：同时只展开一条，按钮原生支持 Enter/Space ---------- */
  var faq = root.querySelector("[data-ln-faq]");
  if (faq) {
    var faqButtons = Array.prototype.slice.call(faq.querySelectorAll(".ln-faq-q button[aria-controls]"));
    faqButtons.forEach(function (btn) {
      on(btn, "click", function () {
        var willOpen = btn.getAttribute("aria-expanded") !== "true";
        faqButtons.forEach(function (other) {
          other.setAttribute("aria-expanded", "false");
          var item = other.closest(".ln-faq-item");
          if (item) item.classList.remove("is-open");
        });
        if (willOpen) {
          btn.setAttribute("aria-expanded", "true");
          var item = btn.closest(".ln-faq-item");
          if (item) item.classList.add("is-open");
        }
      });
    });
  }

  /* ---------- 4. 信源区：公告板实时预览（失败整卡隐藏，不放假数据） ---------- */
  var preview = root.querySelector("[data-ln-preview]");
  if (preview && !demoMode && !window.GongzhiAtlas) {
    var KIND = { need: "求助", experience: "经验", reply: "回复", supplement: "补充", result: "成果" };
    fetch("/api/gongzhi/board?limit=3", { headers: { Accept: "application/json" }, cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("公告暂时读不到（HTTP " + r.status + "）");
        return r.json();
      })
      .then(function (body) {
        var records = body && body.ok === true && body.data && Array.isArray(body.data.records) ? body.data.records : null;
        if (!records || !records.length) { preview.hidden = true; return; }
        var list = preview.querySelector("[data-ln-preview-list]");
        if (!list) { preview.hidden = true; return; }
        records.slice(0, 3).forEach(function (r) {
          var item = el("li");
          var meta = el("div", "ln-preview-meta");
          meta.appendChild(el("span", "ln-preview-kind", KIND[r.kind] || r.kind || "记录"));
          meta.appendChild(el("span", null, r.speaker && r.speaker.name ? r.speaker.name : "发言者未知"));
          if (r.created_at) meta.appendChild(el("time", null, String(r.created_at).slice(0, 10)));
          item.appendChild(meta);
          item.appendChild(el("p", "ln-preview-title", r.title || "（无标题）"));
          list.appendChild(item);
        });
        preview.hidden = false;
      })
      .catch(function () { preview.hidden = true; });
  } else if (preview) {
    preview.hidden = true;
  }

  /* ---------- 5. 信源区浮卡入场：GSAP ScrollTrigger，桌面端且非降级时 ---------- */
  (function initFloatMotion() {
    var stage = root.querySelector("[data-ln-source-stage]");
    if (!stage) return;
    var lefts = Array.prototype.slice.call(stage.querySelectorAll(".ln-float-left-top, .ln-float-left-bottom"));
    var rights = Array.prototype.slice.call(stage.querySelectorAll(".ln-float-right-top, .ln-float-right-bottom"));
    var floats = lefts.concat(rights);
    if (!floats.length) return;
    if (!window.gsap || !window.ScrollTrigger) return; // 无 GSAP：静态展示
    window.gsap.registerPlugin(window.ScrollTrigger);
    var media = window.gsap.matchMedia();
    media.add(
      { isDesktop: "(min-width: 901px)", noMotion: "(prefers-reduced-motion: reduce)" },
      function (ctx) {
        if (ctx.conditions.noMotion) { window.gsap.set(floats, { autoAlpha: 1, x: 0 }); return; }
        var travel = function () { return Math.max(window.innerWidth * 0.1, 100); };
        var tl = window.gsap.timeline({
          defaults: { duration: 0.4, ease: "power3.out", overwrite: "auto" },
          scrollTrigger: { trigger: stage, start: "top 70%", toggleActions: "play none none reverse" },
        });
        tl.fromTo(lefts, { autoAlpha: 0, x: function () { return -travel(); } }, { autoAlpha: 1, x: 0, stagger: 0.06 }, 0);
        tl.fromTo(rights, { autoAlpha: 0, x: function () { return travel(); } }, { autoAlpha: 1, x: 0, stagger: 0.06 }, 0.05);
        return function () { tl.kill(); };
      }
    );
    removers.push(function () { media.revert(); });
  })();
})();
