// Runs before CSS/React so a saved preference never flashes the other theme.
(() => {
  const key = 'gongzhi.preference.theme';
  const root = document.documentElement;
  const valid = value => value === 'light' || value === 'dark';
  function apply(theme) {
    root.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#000000' : '#ffffff');
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      button.hidden = false;
      button.setAttribute('aria-label', theme === 'dark' ? '切换到浅色主题' : '切换到深色主题');
      button.setAttribute('title', theme === 'dark' ? '切换到浅色主题' : '切换到深色主题');
    });
  }
  let saved;
  try { saved = localStorage.getItem(key); } catch { /* Storage is optional. */ }
  apply(valid(saved) ? saved : 'dark');
  document.addEventListener('DOMContentLoaded', () => {
    apply(root.dataset.theme);
    document.querySelectorAll('[data-theme-toggle]').forEach(button => button.addEventListener('click', () => {
      const theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
      apply(theme);
      try { localStorage.setItem(key, theme); } catch { /* Keep the in-page choice usable. */ }
    }));
  });
  window.addEventListener('storage', event => {
    if (event.key === key) apply(valid(event.newValue) ? event.newValue : 'dark');
  });
})();
