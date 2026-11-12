import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { I18nProvider, useI18n } from '@/i18n/i18n';

export default function RootLayout() {
  const scheme = useColorScheme();
  return (
    <I18nProvider>
      <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
        <StatusBar style="auto" />
        <RootStack />
      </ThemeProvider>
    </I18nProvider>
  );
}

function RootStack() {
  const { t } = useI18n();
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: t('scanTest.title') }} />
      <Stack.Screen
        name="scan"
        options={{ presentation: 'fullScreenModal', headerShown: false, gestureEnabled: false }}
      />
      <Stack.Screen name="scans/[id]" options={{ title: t('scanResult.title') }} />
    </Stack>
  );
}
