'use client';

import { createTranslator, type Locale } from '@bairmair/i18n';
import { useMemo, useSyncExternalStore } from 'react';
import {
  getResolvedTheme,
  getThemeChoice,
  setThemeChoice,
  subscribeTheme,
  THEME_CHOICES,
  type ThemeChoice,
} from '@/lib/theme';
import { MonitorIcon, MoonIcon, SunIcon } from './icons';

// The server cannot know the visitor's theme: render neutral until hydrated.
const serverSnapshot = () => null;

/** Header button: flips between light and dark (from whatever is in effect now). */
export function ThemeToggleButton({ locale }: { locale: Locale }) {
  const t = useMemo(() => createTranslator(locale), [locale]);
  const resolved = useSyncExternalStore(subscribeTheme, getResolvedTheme, serverSnapshot);
  const label = resolved === 'dark' ? t('theme.toLight') : t('theme.toDark');
  return (
    <button
      type="button"
      onClick={() => setThemeChoice(resolved === 'dark' ? 'light' : 'dark')}
      aria-label={label}
      title={label}
      className="flex size-9 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
    >
      {resolved === 'dark' ? (
        <SunIcon className="size-[18px]" />
      ) : resolved === 'light' ? (
        <MoonIcon className="size-[18px]" />
      ) : (
        <span className="size-[18px]" />
      )}
    </button>
  );
}

const ICONS: Record<ThemeChoice, typeof SunIcon> = {
  system: MonitorIcon,
  light: SunIcon,
  dark: MoonIcon,
};

/** System / light / dark, as a small segmented control (footer, mobile menu). */
export function ThemeSelect({ locale }: { locale: Locale }) {
  const t = useMemo(() => createTranslator(locale), [locale]);
  const choice = useSyncExternalStore(subscribeTheme, getThemeChoice, serverSnapshot);
  return (
    <div
      role="radiogroup"
      aria-label={t('theme.label')}
      className="inline-flex rounded-full border border-line bg-surface p-0.5"
    >
      {THEME_CHOICES.map((option) => {
        const Icon = ICONS[option];
        const checked = choice === option;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={t(`theme.${option}`)}
            title={t(`theme.${option}`)}
            onClick={() => setThemeChoice(option)}
            className={`flex size-7 items-center justify-center rounded-full transition-colors ${
              checked ? 'bg-surface-3 text-fg' : 'text-fg-subtle hover:text-fg'
            }`}
          >
            <Icon className="size-4" />
          </button>
        );
      })}
    </div>
  );
}
