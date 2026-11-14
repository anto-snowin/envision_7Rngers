/**
 * Light / dark / system theme.
 *
 * The `.dark` class on <html> is the single source of truth for Tailwind. The
 * inline script in index.html applies the stored preference before first paint;
 * this context keeps it in sync afterwards and follows the OS when the user has
 * chosen "system".
 */
import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';

const STORAGE_KEY = 'dcms.theme';

const ThemeContext = createContext(null);

/** Read the stored preference, tolerating blocked storage. */
function readStoredPreference() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* storage unavailable */
  }
  return 'system';
}

/** Apply or remove the `.dark` class. */
function applyTheme(isDark) {
  const root = document.documentElement;
  root.classList.toggle('dark', isDark);
  // Keep the browser chrome (mobile address bar) in step with the theme.
  const meta = document.querySelector('meta[name="theme-color"]:not([media])');
  if (meta) meta.setAttribute('content', isDark ? '#042f2e' : '#0f766e');
}

export function ThemeProvider({ children }) {
  // 'light' | 'dark' | 'system'
  const [preference, setPreference] = useState(readStoredPreference);

  // Whether the OS currently prefers dark, tracked live.
  const [systemPrefersDark, setSystemPrefersDark] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const isDark = preference === 'dark' || (preference === 'system' && systemPrefersDark);

  // Follow the OS while the preference is "system".
  useEffect(() => {
    if (!window.matchMedia) return undefined;

    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (event) => setSystemPrefersDark(event.matches);

    query.addEventListener('change', handler);
    return () => query.removeEventListener('change', handler);
  }, []);

  // Reflect the resolved theme onto the document.
  useEffect(() => {
    applyTheme(isDark);
  }, [isDark]);

  // Persist the preference. "system" is stored by removing the key, so a user
  // who later changes their OS setting is not pinned to an old choice.
  useEffect(() => {
    try {
      if (preference === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      /* storage unavailable — the preference lasts for this session only */
    }
  }, [preference]);

  /** Cycle light → dark → system. */
  const cycleTheme = useCallback(() => {
    setPreference((current) => {
      if (current === 'light') return 'dark';
      if (current === 'dark') return 'system';
      return 'light';
    });
  }, []);

  /** Flip between light and dark, ignoring "system". */
  const toggleTheme = useCallback(() => {
    setPreference(isDark ? 'light' : 'dark');
  }, [isDark]);

  const value = useMemo(
    () => ({ preference, setPreference, isDark, cycleTheme, toggleTheme }),
    [preference, isDark, cycleTheme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Access the theme. Must be used inside `ThemeProvider`. */
export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
}
