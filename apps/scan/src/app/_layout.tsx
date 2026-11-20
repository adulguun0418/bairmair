import { Onest_400Regular } from '@expo-google-fonts/onest/400Regular';
import { Onest_500Medium } from '@expo-google-fonts/onest/500Medium';
import { Onest_600SemiBold } from '@expo-google-fonts/onest/600SemiBold';
import { Onest_700Bold } from '@expo-google-fonts/onest/700Bold';
import { Onest_800ExtraBold } from '@expo-google-fonts/onest/800ExtraBold';
import { createTranslator, DEFAULT_LOCALE } from '@bairmair/i18n';
import { AuthProvider, type AuthConfig } from '@bairmair/native-auth';
import { Button } from '@bairmair/native-ui/button';
import { I18nProvider, useI18n } from '@bairmair/native-ui/i18n';
import { Text } from '@bairmair/native-ui/text';
import { FONT_FAMILIES, useColors, type Colors } from '@bairmair/native-ui/theme';
import { useFonts } from 'expo-font';
import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider,
  type ErrorBoundaryProps,
  type Theme,
} from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { startUploads } from '@/uploads/uploads';

/** The shared sign-in, set up for this app (the captcha page returns to bairmairscan://). */
const AUTH_CONFIG: AuthConfig = {
  client: supabase,
  supabaseUrl: env.supabaseUrl,
  supabasePublishableKey: env.supabasePublishableKey,
  siteUrl: env.siteUrl,
  captchaReturn: 'scan',
};

// Kept up until the fonts are loaded (a moment: they ship inside the app or the update).
void SplashScreen.preventAutoHideAsync();

/** React Navigation's theme (headers, backgrounds) from the shared tokens and Onest. */
function navigationTheme(colors: Colors, dark: boolean, fontsLoaded: boolean): Theme {
  const base = dark ? DarkTheme : DefaultTheme;
  // Without the fonts (a failed load), headers keep the system font.
  const face = (family: string, fallback: Theme['fonts']['regular']) =>
    fontsLoaded ? { fontFamily: family, fontWeight: 'normal' as const } : fallback;
  return {
    dark,
    colors: {
      ...base.colors,
      primary: colors.accent,
      background: colors.background,
      card: colors.background,
      text: colors.text,
      border: colors.border,
      notification: colors.favorite,
    },
    fonts: {
      regular: face(FONT_FAMILIES.regular, base.fonts.regular),
      medium: face(FONT_FAMILIES.medium, base.fonts.medium),
      bold: face(FONT_FAMILIES.bold, base.fonts.bold),
      heavy: face(FONT_FAMILIES.extrabold, base.fonts.heavy),
    },
  };
}

/**
 * A screen failed to render: offer a retry instead of the app closing. Shown in place of the
 * whole app, outside the language provider, so in Mongolian (the app's default).
 */
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  const colors = useColors();
  const t = createTranslator(DEFAULT_LOCALE);
  return (
    <View style={[styles.error, { backgroundColor: colors.background }]}>
      <Text style={[styles.errorTitle, { color: colors.text }]}>{t('errorPage.title')}</Text>
      <Text style={[styles.errorBody, { color: colors.textMuted }]}>{t('errorPage.body')}</Text>
      <Button title={t('errorPage.retry')} onPress={() => void retry()} />
    </View>
  );
}

export default function RootLayout() {
  const colors = useColors();
  const dark = useColorScheme() === 'dark';
  const [fontsLoaded, fontError] = useFonts({
    Onest_400Regular,
    Onest_500Medium,
    Onest_600SemiBold,
    Onest_700Bold,
    Onest_800ExtraBold,
  });
  const ready = fontsLoaded || fontError !== null;
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);
  // Scans waiting for their link are sent whenever the app is open.
  useEffect(startUploads, []);
  if (!ready) return null;
  return (
    <I18nProvider>
      <AuthProvider config={AUTH_CONFIG}>
        <ThemeProvider value={navigationTheme(colors, dark, fontsLoaded)}>
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
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen
        name="index"
        options={{ title: t('scanApp.homeTitle'), headerLargeTitle: true }}
      />
      <Stack.Screen
        name="scan"
        options={{ presentation: 'fullScreenModal', headerShown: false, gestureEnabled: false }}
      />
      <Stack.Screen name="review/[id]" options={{ title: t('scanApp.review.title') }} />
      <Stack.Screen name="local/[id]" options={{ title: t('scanResult.files') }} />
      <Stack.Screen name="scans/[id]/index" options={{ title: '' }} />
      <Stack.Screen
        name="scans/[id]/model"
        // iOS 26 turns a swipe right anywhere into "back", which took the 3D view's drags.
        options={{ title: t('viewer.label'), fullScreenGestureEnabled: false }}
      />
      <Stack.Screen name="account" options={{ title: t('account.title') }} />
      <Stack.Screen name="sign-in" options={{ title: t('auth.title') }} />
      <Stack.Screen name="verify" options={{ title: t('auth.codeTitle') }} />
      <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
      <Stack.Screen name="diagnostics" options={{ title: t('scanApp.diagnostics.title') }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  error: { flex: 1, justifyContent: 'center', gap: 16, padding: 24 },
  errorTitle: { fontSize: 22, fontWeight: '700' },
  errorBody: { fontSize: 16, lineHeight: 22 },
});
