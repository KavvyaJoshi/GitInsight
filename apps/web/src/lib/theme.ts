export type ThemePreference = 'system' | 'light' | 'dark';

const KEY = 'gi-theme';
export const THEME_EVENT = 'gi-theme-change';

export function isDark(): boolean {
  return document.documentElement.classList.contains('dark');
}

/** Apply a theme preference now and remember it on this device; "system" follows the OS setting. */
export function setTheme(preference: ThemePreference) {
  const dark = preference === 'dark' || (preference === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  try {
    if (preference === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, preference);
  } catch {
    // Storage can be unavailable (private mode); the theme still applies for this visit.
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}
