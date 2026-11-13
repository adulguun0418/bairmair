/**
 * Light / dark theme. The visitor's choice lives in localStorage (a per-browser convenience);
 * without one, the system setting decides. `globals.css` reads `data-theme` on <html>.
 */

export type ThemeChoice = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_CHOICES: readonly ThemeChoice[] = ['system', 'light', 'dark'];

const STORAGE_KEY = 'bairmair-theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

/**
 * Inline in <head>, so the stored choice applies before the first paint (no light flash on a
 * dark page). The app's 3D embed always stays light: the app around it draws its own chrome.
 * Keep in sync with `STORAGE_KEY`.
 */
export const THEME_SCRIPT = `(function(){try{var d=document.documentElement;if(/(^|\\/)embed\\//.test(location.pathname)){d.dataset.theme='light';return}var t=localStorage.getItem('${STORAGE_KEY}');if(t==='light'||t==='dark')d.dataset.theme=t}catch(e){}})()`;

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function readChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

/** Subscribes to choice changes (this tab, other tabs) and to the system setting. */
export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  const media = window.matchMedia(DARK_QUERY);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    applyChoice(readChoice());
    notify();
  };
  media.addEventListener('change', listener);
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    media.removeEventListener('change', listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function getThemeChoice(): ThemeChoice {
  return readChoice();
}

/** The theme in effect: the choice, or the system setting for "system". */
export function getResolvedTheme(): ResolvedTheme {
  const choice = readChoice();
  if (choice !== 'system') return choice;
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

function applyChoice(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'system') delete root.dataset.theme;
  else root.dataset.theme = choice;
}

export function setThemeChoice(choice: ThemeChoice): void {
  try {
    if (choice === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Storage blocked (private mode): the choice still applies until the page is left.
  }
  applyChoice(choice);
  notify();
}
