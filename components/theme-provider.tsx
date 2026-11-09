'use client';

import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import { Moon, Sun } from 'lucide-react';

type Theme = 'light' | 'dark';
const storageKey = 'donekite-theme';
let preference: Theme | null | undefined;
const listeners = new Set<() => void>();

function readPreference() {
  if (preference === undefined) {
    try {
      const saved = window.localStorage.getItem(storageKey);
      preference = saved === 'dark' || saved === 'light' ? saved : null;
    } catch {
      preference = null;
    }
  }
  return preference;
}

function getTheme(): Theme {
  return readPreference() ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

function publish() {
  applyTheme(getTheme());
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const onSystemChange = () => { if (readPreference() === null) publish(); };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== storageKey && event.key !== null) return;
    preference = event.newValue === 'light' || event.newValue === 'dark' ? event.newValue : null;
    publish();
  };
  media.addEventListener('change', onSystemChange);
  window.addEventListener('storage', onStorage);
  applyTheme(getTheme());
  return () => {
    listeners.delete(listener);
    media.removeEventListener('change', onSystemChange);
    window.removeEventListener('storage', onStorage);
  };
}

function toggleTheme() {
  preference = getTheme() === 'dark' ? 'light' : 'dark';
  try {
    window.localStorage.setItem(storageKey, preference);
  } catch {
    // Keep the choice for this visit when the browser blocks storage.
  }
  publish();
}

const getServerTheme = () => null;
const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(subscribe, getTheme, getServerTheme);
  return <ThemeContext value={theme}>{children}</ThemeContext>;
}

export function ThemeToggle({ className = '' }: { className?: string }) {
  const theme = useContext(ThemeContext);
  const label = theme === null ? 'Switch color theme' : `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`;
  return <button
    type="button"
    className={`theme-toggle ${className}`.trim()}
    onClick={toggleTheme}
    aria-label={label}
    title={label}
  >
    <Moon className="theme-moon" size={17} aria-hidden="true" />
    <Sun className="theme-sun" size={17} aria-hidden="true" />
    <span className="theme-mode-dark">Dark mode</span>
    <span className="theme-mode-light">Light mode</span>
  </button>;
}
