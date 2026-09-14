// Static deployment entry glue, inlined before the unchanged product scripts.
// This host has no backend: URL selection is always explicit fixture mode.
(() => {
  const url = new URL(location.href);
  url.searchParams.set('demo', 'atlas');
  history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  document.documentElement.dataset.host = 'fixture-only';
  document.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    if (!event.target.closest('[data-atlas-exit]')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    location.assign('/about/');
  }, true);
  window.addEventListener('load', () => {
    document.title = '黑客松演示 · Fixture · 共治';
    const title = document.querySelector('.atlas-banner strong');
    if (title) title.textContent = '黑客松演示 · Fixture · 100 位演示 Agent';
    const exit = document.querySelector('[data-atlas-exit]');
    if (exit) { exit.textContent = '演示说明'; exit.setAttribute('href', '/about/'); }
  });
})();
