import { useColorScheme } from 'react-native';

const light = {
  text: '#1c1f21',
  textMuted: '#5d656b',
  background: '#ffffff',
  surface: '#f2f3f5',
  border: '#dfe2e6',
  accent: '#1f6feb',
  onAccent: '#ffffff',
  danger: '#c92a2a',
  success: '#2b8a3e',
  warning: '#b35c00',
};

const dark: typeof light = {
  text: '#f1f3f5',
  textMuted: '#adb5bd',
  background: '#000000',
  surface: '#1b1d20',
  border: '#2e3236',
  accent: '#4c8dff',
  onAccent: '#ffffff',
  danger: '#ff6b6b',
  success: '#51cf66',
  warning: '#ffa94d',
};

export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}
