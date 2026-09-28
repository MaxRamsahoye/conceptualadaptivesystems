// Site-wide light/dark preference, shared by the library, viewer and presenter.
// No stored choice = light on the library, and decks look as authored.

const KEY = 'slides:theme';
const root = document.documentElement;

export function getPref() {
  try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : null; } catch { return null; }
}

function setPref(v) {
  try { localStorage.setItem(KEY, v); } catch { /* storage unavailable: applies to this page only */ }
}

/**
 * Wire up the toggle. `fallback()` names the look in force when nothing is
 * stored (light on the library, the deck's own theme in the viewer).
 * Returns { toggle, effective }.
 */
export function initTheme({ fallback, onChange } = {}) {
  const defaultLook = fallback || (() => 'light');
  let pref = getPref();

  const effective = () => pref || defaultLook();
  const apply = () => {
    if (pref) root.dataset.theme = pref; else delete root.dataset.theme;
    root.dataset.effectiveTheme = effective();
    for (const b of document.querySelectorAll('.theme-toggle')) {
      const next = effective() === 'dark' ? 'light' : 'dark';
      b.setAttribute('aria-label', `Switch to ${next} theme`);
      b.title = `Switch to ${next} theme${b.dataset.key ? ` (${b.dataset.key})` : ''}`;
    }
    onChange?.(effective());
  };
  const toggle = () => {
    pref = effective() === 'dark' ? 'light' : 'dark';
    setPref(pref);
    apply();
  };

  document.addEventListener('click', (e) => { if (e.target.closest('.theme-toggle')) toggle(); });
  // Keep other open windows (e.g. presenter view) in step.
  window.addEventListener('storage', (e) => { if (e.key === KEY) { pref = getPref(); apply(); } });
  apply();
  return { toggle, effective };
}

export const themeIcon = `
  <svg class="icon-moon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>
  <svg class="icon-sun" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/></svg>`;
