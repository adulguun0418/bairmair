import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { Appearance } from 'react-native';

/** "system" follows the phone's setting; the others override it for this app only. */
export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];

const STORAGE_KEY = 'bairmair.theme';

let current: ThemePreference = 'system';
const listeners = new Set<() => void>();

function isPreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

/**
 * Overrides the app's appearance natively (iOS: the windows' interface style; Android: the night
 * mode), so headers, tab bar, status bar, keyboard and alerts follow it as well as
 * `useColorScheme()` and with it `useColors()`.
 */
function apply(preference: ThemePreference): void {
  Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
}

/** Reads the saved choice and applies it; called once before the first screen shows. */
export async function loadThemePreference(): Promise<void> {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (isPreference(saved)) current = saved;
  } catch {
    // Unreadable storage: follow the system.
  }
  if (current !== 'system') apply(current);
}

export function setThemePreference(preference: ThemePreference): void {
  current = preference;
  apply(preference);
  for (const listener of listeners) listener();
  void AsyncStorage.setItem(STORAGE_KEY, preference).catch(() => undefined);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, () => current);
}
