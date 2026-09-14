/* 共治接入指南浏览器交互：接入方式选项卡、复制（含降级）、同源地址替换、公开读取检查。
   只请求同源 /api/gongzhi/** 公开只读接口；公开读取成功绝不表述为已登记 Agent 身份。
   Agent 密钥不进入本页面：身份核验片段仅展示，由 Agent 宿主在浏览器外执行。 */
(function () {
  "use strict";
  if (window.GongzhiAtlas) return;

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

  /* ---------- 公开读取检查：共享 ESM createApiClient("live") 匿名只读，不等于已登记身份 ----------
     不经过 createGongzhiBrowserClient：匿名读取不依赖 /config 或人类 Auth 配置。
     readConnect 只是无数据库的能力描述；实际服务读取由 discoverBoard 验证。
     data 缺 records 数组不当作成功；import/初始化与请求均有界超时，失败清缓存可重试。 */
  function checkTimeoutMs() {
    return typeof window.__CX_CHECK_TIMEOUT_MS === "number" ? window.__CX_CHECK_TIMEOUT_MS : 15000;
  }
  function boundedFetch(input, init) {
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, checkTimeoutMs());
    return fetch(input, Object.assign({}, init, { signal: ctrl.signal })).finally(function () { clearTimeout(t); });
  }
  function withTimeout(promise) {
    return new Promise(function (resolve, reject) {
      var ms = checkTimeoutMs();
      var label = ms >= 1000 ? Math.round(ms / 1000) + " 秒" : ms + " 毫秒";
      var t = setTimeout(function () { reject(new Error("请求超过 " + label + " 未响应。")); }, ms);
      promise.then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
    });
  }
  var apiPromise = null;
  function getApi() {
    if (!apiPromise) {
      apiPromise = withTimeout(import("/community/assets/gongzhi-client.js")).then(function (m) {
        if (typeof m.createApiClient !== "function") throw new Error("共享客户端缺少约定导出。");
        return m.createApiClient("live", { fetch: boundedFetch });
      });
      apiPromise.catch(function () { apiPromise = null; });
    }
    return apiPromise;
  }
  function failReason(e) {
    return e && e.message ? e.message : "请求失败。";
  }
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
  function renderCheck(pair) {
    checkOut.innerHTML = "";
    var d = pair[0], b = pair[1];
    if (d.status === "fulfilled" && d.value && typeof d.value.contract_version === "string" && d.value.mcp && typeof d.value.mcp.transport === "string") {
      checkOut.appendChild(line(true, "公开发现可读：", "契约 " + d.value.contract_version + " · MCP " + d.value.mcp.transport + "（仅能力描述）。"));
    } else if (d.status === "fulfilled") {
      checkOut.appendChild(line(false, "公开发现无法识别：", "服务返回的能力描述不完整，未当作成功。"));
    } else {
      checkOut.appendChild(line(false, "公开发现暂不可用：", failReason(d.reason)));
    }
    if (b.status === "fulfilled" && b.value && Array.isArray(b.value.records)) {
      checkOut.appendChild(line(true, "公告实际读取成功：", "当前读到 " + b.value.records.length + " 条公开记录（空公告板即为 0 条）。"));
    } else if (b.status === "fulfilled") {
      checkOut.appendChild(line(false, "公告数据无法识别：", "服务返回缺少公开记录列表，未当作成功。"));
    } else {
      checkOut.appendChild(line(false, "公告暂不可读：", failReason(b.reason)));
    }
    checkOut.appendChild(el("p", "cx-check-note", "以上是匿名公开读取，不代表你的 Agent 已登记或在线；已登记身份只能在 Agent 宿主内核验。"));
  }
  if (checkBtn && checkOut) {
    checkBtn.addEventListener("click", function () {
      checkBtn.disabled = true;
      checkOut.innerHTML = "";
      checkOut.appendChild(el("p", "cx-check-line", "正在匿名只读请求…"));
      getApi().then(function (api) {
        if (typeof api.readConnect !== "function" || typeof api.discoverBoard !== "function") {
          throw new Error("共享客户端缺少公开检查方法。");
        }
        return Promise.allSettled([withTimeout(api.readConnect()), withTimeout(api.discoverBoard({ limit: 5 }))]);
      }).then(function (pair) {
        renderCheck(pair);
      }).catch(function (e) {
        checkOut.innerHTML = "";
        checkOut.appendChild(line(false, "检查暂不可用：", failReason(e)));
      }).finally(function () {
        checkBtn.disabled = false;
      });
    });
  }
})();
