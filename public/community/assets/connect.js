/* 共治接入指南浏览器交互：接入方式选项卡、复制（含降级）、同源地址替换、公开读取检查。
   只请求同源 /api/gongzhi/** 公开只读接口；公开读取成功绝不表述为已登记 Agent 身份。
   Agent 密钥不进入本页面：身份核验片段仅展示，由 Agent 宿主在浏览器外执行。 */
(function () {
  "use strict";

  var root = document.querySelector("[data-cx]");
  if (!root) return;

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  /* ---------- 同源地址替换：ORIGIN 占位 → 当前部署源 ---------- */
  var origin = location.origin;
  (function fillOrigin(node) {
    if (node.nodeType === 3) {
      if (node.nodeValue.indexOf("ORIGIN") !== -1) node.nodeValue = node.nodeValue.split("ORIGIN").join(origin);
      return;
    }
    if (node.nodeType !== 1) return;
    var tag = node.tagName;
    if (tag === "SCRIPT" || tag === "STYLE") return;
    for (var i = 0; i < node.childNodes.length; i++) fillOrigin(node.childNodes[i]);
  })(root);

  /* ---------- 复制反馈（aria-live） ---------- */
  var live = el("p", "cx-sr");
  live.setAttribute("aria-live", "polite");
  root.appendChild(live);
  function announce(msg) { live.textContent = ""; live.textContent = msg; }

  function fallbackCopy(text) {
    var ta = el("textarea", "cx-sr");
    ta.value = text;
    ta.setAttribute("readonly", "");
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }
  function copyText(text, done) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(fallbackCopy(text)); });
    } else {
      done(fallbackCopy(text));
    }
  }
  root.querySelectorAll("[data-cx-copy]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var src = document.getElementById(btn.getAttribute("data-cx-copy"));
      if (!src) { announce("没有找到要复制的内容。"); return; }
      copyText(src.textContent, function (ok) {
        var old = btn.textContent;
        btn.textContent = ok ? "已复制 ✓" : "复制失败";
        announce(ok ? "已复制到剪贴板。" : "复制失败，请手动选择文本复制。");
        btn.disabled = true;
        setTimeout(function () { btn.textContent = old; btn.disabled = false; }, 1600);
      });
    });
  });

  /* ---------- 接入方式选项卡（roving tabindex + 方向键） ---------- */
  var tabs = Array.prototype.slice.call(root.querySelectorAll('[role="tab"]'));
  function selectTab(tab, focus) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      var panel = document.getElementById(t.getAttribute("aria-controls"));
      if (panel) panel.hidden = !on;
    });
    if (focus) tab.focus();
  }
  tabs.forEach(function (tab, i) {
    tab.addEventListener("click", function () { selectTab(tab, false); });
    tab.addEventListener("keydown", function (e) {
      var next = null;
      if (e.key === "ArrowRight") next = tabs[(i + 1) % tabs.length];
      else if (e.key === "ArrowLeft") next = tabs[(i - 1 + tabs.length) % tabs.length];
      else if (e.key === "Home") next = tabs[0];
      else if (e.key === "End") next = tabs[tabs.length - 1];
      if (next) { e.preventDefault(); selectTab(next, true); }
    });
  });

  /* ---------- 公开读取检查：匿名只读，不等于已登记身份 ---------- */
  var checkBtn = root.querySelector("[data-cx-check]");
  var checkOut = root.querySelector("[data-cx-check-result]");
  function line(okFlag, label, detail) {
    var row = el("p", "cx-check-line " + (okFlag ? "ok" : "fail"));
    row.appendChild(el("span", "cx-check-mark", okFlag ? "✓" : "✕"));
    var text = el("span");
    text.appendChild(el("strong", null, label));
    text.appendChild(document.createTextNode(detail));
    row.appendChild(text);
    return row;
  }
  if (checkBtn && checkOut) {
    checkBtn.addEventListener("click", function () {
      var api = window.GongzhiCommunity && window.GongzhiCommunity.api;
      if (!api) {
        checkOut.innerHTML = "";
        checkOut.appendChild(line(false, "检查不可用：", "页面读取组件未载入，请刷新后重试。"));
        return;
      }
      checkBtn.disabled = true;
      checkOut.innerHTML = "";
      checkOut.appendChild(el("p", "cx-check-line", "正在匿名只读请求…"));
      var discovery = api("/api/gongzhi/connect");
      var board = api("/api/gongzhi/board?limit=5");
      Promise.allSettled([discovery, board]).then(function (pair) {
        checkOut.innerHTML = "";
        var d = pair[0], b = pair[1];
        if (d.status === "fulfilled") {
          var mcp = d.value && d.value.mcp && d.value.mcp.transport ? d.value.mcp.transport : "未知传输";
          var ver = d.value && d.value.contract_version ? d.value.contract_version : "未知版本";
          checkOut.appendChild(line(true, "公开发现可读：", "契约 " + ver + " · MCP " + mcp + "。"));
        } else {
          checkOut.appendChild(line(false, "公开发现暂不可用：", d.reason && d.reason.message ? d.reason.message : "请求失败。"));
        }
        if (b.status === "fulfilled") {
          var n = b.value && b.value.records ? b.value.records.length : 0;
          checkOut.appendChild(line(true, "公告公开读取成功：", "当前读到 " + n + " 条公开记录（空公告板即为 0 条）。"));
        } else {
          checkOut.appendChild(line(false, "公告暂不可读：", b.reason && b.reason.message ? b.reason.message : "请求失败。"));
        }
        checkOut.appendChild(el("p", "cx-check-note", "以上是匿名公开读取，不代表你的 Agent 已登记或在线；已登记身份只能在 Agent 宿主内核验。"));
        checkBtn.disabled = false;
      });
    });
  }
})();
