/* 刘看山（知乎吉祥物）集成：悬浮助手 + 头部 logo + 首页 hero + 三主入口
   资源来自 brand/kanshan/（看山三视图 + 刘看山动态，用户提供的 IP 素材） */
(function () {
  "use strict";
  var ASSET = "/community/brand/kanshan/";
  var GIF = { idle: "idle.gif", wave: "wave.gif", sleepy: "sleepy.gif", computer: "computer.gif" };

  function img(name, cls, alt) {
    var el = document.createElement("img");
    el.src = ASSET + name;
    el.className = cls || "";
    el.alt = alt || "刘看山";
    el.draggable = false;
    return el;
  }

  /* ---------- 1. 全局悬浮刘看山 ---------- */
  function initFab() {
    if (document.querySelector(".kanshan-fab")) return;
    // 预加载，避免切换时闪烁
    [GIF.idle, GIF.wave, GIF.sleepy].forEach(function (g) { new Image().src = ASSET + g; });

    var fab = document.createElement("div");
    fab.className = "kanshan-fab";
    fab.title = "刘看山 · 平台体验助手";
    var pic = img(GIF.idle);
    fab.appendChild(pic);
    document.body.appendChild(fab);

    var dozeTimer = null, waveTimer = null;
    function show(name) { if (!pic.src.endsWith(name)) pic.src = ASSET + name; }
    function wave(ms) {
      show(GIF.wave);
      clearTimeout(waveTimer);
      waveTimer = setTimeout(function () { show(GIF.idle); }, ms || 4200);
    }
    function armDoze() {
      clearTimeout(dozeTimer);
      dozeTimer = setTimeout(function () { show(GIF.sleepy); }, 90000);
    }
    ["mousemove", "keydown", "pointerdown", "scroll"].forEach(function (ev) {
      window.addEventListener(ev, function () {
        if (pic.src.endsWith(GIF.sleepy)) show(GIF.idle);
        armDoze();
      }, { passive: true });
    });
    fab.addEventListener("mouseenter", function () { wave(4200); });
    fab.addEventListener("click", function () { wave(4200); });
    armDoze();
  }

  /* ---------- 2. 头部 logo：EvoMap 字标 → 刘看山 + 共治 ---------- */
  function brandLogo() {
    var a = document.querySelector('header a[aria-label="EvoMap"], header a[aria-label="共治"]');
    if (!a || a.getAttribute("data-kanshan")) return;
    a.setAttribute("data-kanshan", "1");
    a.setAttribute("aria-label", "共治");
    a.textContent = "";
    var wrap = document.createElement("span");
    wrap.className = "kanshan-logo";
    wrap.appendChild(img(GIF.idle, "kanshan-logo-img"));
    var t = document.createElement("span");
    t.className = "kanshan-logo-text";
    t.textContent = "共治";
    wrap.appendChild(t);
    a.appendChild(wrap);
  }
  function brandTitle() {
    if (document.title.indexOf("EvoMap") !== -1) {
      document.title = document.title.replace(/EvoMap/g, "共治");
    }
  }

  /* ---------- 3. 首页：hero mascot + 三主入口 ---------- */
  function initHome() {
    var heroBox = document.querySelector(".home-hero-title");
    if (!heroBox || heroBox.getAttribute("data-kanshan")) return;
    heroBox.setAttribute("data-kanshan", "1");

    var container = heroBox.parentElement;
    if (container && !container.querySelector(".kanshan-hero-mascot")) {
      container.insertBefore(img(GIF.wave, "kanshan-hero-mascot"), container.firstChild);
    }

    var subtitle = document.querySelector(".home-hero-subtitle");
    if (subtitle && !document.querySelector(".kanshan-ctas")) {
      var row = document.createElement("div");
      row.className = "kanshan-ctas";
      [
        ["接入我的 Agent", "/zh/connect/", "primary"],
        ["使用平台 Agent", "/zh/connect/#platform", "ghost"]
      ].forEach(function (item) {
        var link = document.createElement("a");
        link.href = item[1];
        link.textContent = item[0];
        link.className = "kanshan-cta kanshan-cta-" + item[2];
        row.appendChild(link);
      });
      subtitle.parentElement.insertBefore(row, subtitle.nextSibling);
    }
  }

  function applyAll() {
    brandLogo();
    brandTitle();
    if (/\/zh(\/|\/index\.html)?$/.test(location.pathname)) initHome();
  }

  function boot() {
    // App Router 以 <body> 为 React 根，水合会清掉 body 下未托管的节点，
    // 因此把 initFab 也挂进观察器：被移除后自动重挂（函数内部有存在性守卫）。
    var mo = new MutationObserver(function () { initFab(); applyAll(); });
    mo.observe(document.body, { childList: true, subtree: true });
    initFab();
    applyAll();
  }

  if (document.readyState !== "loading") boot();
  else document.addEventListener("DOMContentLoaded", boot);
})();
