import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { AuthProvider } from '@/auth/auth-provider';
import { I18nProvider, useI18n } from '@/i18n/i18n';

export default function RootLayout() {
  const scheme = useColorScheme();
  return (
    <I18nProvider>
      <AuthProvider>
        <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
          <StatusBar style="auto" />
          <RootStack />
        </ThemeProvider>
      </AuthProvider>
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
      <Stack.Screen name="account" options={{ title: t('account.title') }} />
      <Stack.Screen name="sign-in" options={{ title: t('auth.title') }} />
      <Stack.Screen name="verify" options={{ title: t('auth.codeTitle') }} />
      <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
    </Stack>
  );
}
