/* URL-only entry selection. Runs before Atlas, identity and API consumers. */
(function () {
  "use strict";
  var url = new URL(location.href), params = url.searchParams;
  var staticHost = document.documentElement.dataset.host === "fixture-only";
  function explicitLive(p) { return p.has("auth") || p.get("view") === "live" || p.get("graph") === "registered" || p.get("graph") === "live"; }
  var home = /^\/zh\/?$/.test(url.pathname) || url.pathname === "/community/zh/index.html";
  if (staticHost) {
    params.delete("auth"); params.delete("view");
    if (params.get("graph") === "registered" || params.get("graph") === "live") params.delete("graph");
    params.set("demo", "atlas");
  } else if (explicitLive(params)) {
    params.delete("demo"); params.set("view", "live");
  } else if (home && !params.has("demo") && !params.has("speaker")) params.set("demo", "atlas");
  var demo = params.get("demo") === "atlas";
  // Persist explicit real selection in the URL after account.js consumes the auth notice.
  if (!demo && !staticHost) params.set("view", "live");
  if (url.href !== location.href) history.replaceState(history.state, "", url.pathname + url.search + url.hash);
  function link(a) {
    if (!a || !a.hasAttribute("href")) return;
    var target = new URL(a.href, location.origin);
    if (target.origin !== location.origin || !(/^\/zh(?:\/|$)/.test(target.pathname) || /^\/community\/zh\//.test(target.pathname))) return;
    if (a.hasAttribute("data-mode-live") || a.hasAttribute("data-atlas-exit") || explicitLive(target.searchParams)) {
      target.searchParams.delete("demo"); target.searchParams.set("view", "live");
    } else if (demo || target.searchParams.get("demo") === "atlas") target.searchParams.set("demo", "atlas");
    else target.searchParams.set("view", "live");
    a.href = target.pathname + target.search + target.hash;
  }
  window.GongzhiMode = { demo: demo, staticHost: staticHost, link: link };
  document.addEventListener("DOMContentLoaded", function () { document.querySelectorAll("a[href]").forEach(link); });
  document.addEventListener("click", function (event) { if (event.target instanceof Element) link(event.target.closest("a[href]")); }, true);
})();
