// First, so error tracking is listening before anything else runs.
import { captureError } from '@/lib/error-tracking';
import { Onest_400Regular } from '@expo-google-fonts/onest/400Regular';
import { Onest_500Medium } from '@expo-google-fonts/onest/500Medium';
import { Onest_600SemiBold } from '@expo-google-fonts/onest/600SemiBold';
import { Onest_700Bold } from '@expo-google-fonts/onest/700Bold';
import { Onest_800ExtraBold } from '@expo-google-fonts/onest/800ExtraBold';
import { createTranslator, DEFAULT_LOCALE } from '@bairmair/i18n';
import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider,
  type ErrorBoundaryProps,
  type Theme,
} from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';
import { AuthProvider, type AuthConfig } from '@bairmair/native-auth';
import { startFavorites } from '@/browse/favorites';
import { I18nProvider, useI18n } from '@bairmair/native-ui/i18n';
import { UpdateBanner } from '@/lib/app-update';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { startListingSync } from '@/listings/listings';
import { loadThemePreference } from '@/ui/appearance';
import { Button } from '@bairmair/native-ui/button';
import { Text } from '@bairmair/native-ui/text';
import { FONT_FAMILIES, useColors, type Colors } from '@bairmair/native-ui/theme';

/** The shared sign-in, set up for this app (captcha returns to bairmair://). */
const AUTH_CONFIG: AuthConfig = {
  client: supabase,
  supabaseUrl: env.supabaseUrl,
  supabasePublishableKey: env.supabasePublishableKey,
  siteUrl: env.siteUrl,
  captchaReturn: 'app',
  reportError: captureError,
};

// Kept up until the fonts are loaded (a moment: they ship inside the app or the update).
void SplashScreen.preventAutoHideAsync();

/** React Navigation's theme (headers, backgrounds, tab tint) from the app's tokens and Onest. */
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
 * A screen failed to render: report it and offer a retry, instead of the app closing. Shown in
 * place of the whole app, outside the language provider, so in Mongolian (the app's default).
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const colors = useColors();
  const t = createTranslator(DEFAULT_LOCALE);
  useEffect(() => {
    captureError(error, { boundary: 'root' });
  }, [error]);
  return (
    <View style={[styles.error, { backgroundColor: colors.background }]}>
      <Text style={[styles.errorTitle, { color: colors.text }]}>{t('errorPage.title')}</Text>
      <Text style={[styles.errorBody, { color: colors.textMuted }]}>{t('errorPage.body')}</Text>
      <Button title={t('errorPage.retry')} onPress={() => void retry()} />
    </View>
  );
}

export const unstable_settings = {
  // Deep links into a pushed screen still get the tabs underneath to go back to.
  initialRouteName: '(tabs)',
};

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
  // The saved light/dark choice is applied before the first screen, so it never flashes.
  const [themeLoaded, setThemeLoaded] = useState(false);
  useEffect(() => {
    void loadThemePreference().finally(() => setThemeLoaded(true));
  }, []);
  const ready = (fontsLoaded || fontError !== null) && themeLoaded;
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);
  // Listings sync whenever the app is open, whichever screen is showing.
  useEffect(startListingSync, []);
  // Saved listings follow the signed-in user.
  useEffect(startFavorites, []);
  if (!ready) return null;
  return (
    <I18nProvider>
      <AuthProvider config={AUTH_CONFIG}>
        <ThemeProvider value={navigationTheme(colors, dark, fontsLoaded)}>
          <StatusBar style="auto" />
          <RootStack />
          <UpdateBanner />
        </ThemeProvider>
      </AuthProvider>
    </I18nProvider>
  );
}

/**
 * The tabs, with every other screen pushed over them. Buyers browse in the tabs; a listing's
 * public page is `/listing/[id]`, while the seller's editor stays at `/listings/[id]`.
 */
function RootStack() {
  const { t } = useI18n();
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="listing/[id]/index" options={{ title: '' }} />
      <Stack.Screen
        name="listing/[id]/model"
        // iOS 26 turns a swipe right anywhere on the screen into "back", which took the 3D view's
        // drags. Only the swipe from the left edge goes back here.
        options={{ title: t('viewer.label'), fullScreenGestureEnabled: false }}
      />
      <Stack.Screen
        name="listing/[id]/report"
        options={{ presentation: 'formSheet', title: t('report.title'), sheetGrabberVisible: true }}
      />
      <Stack.Screen name="agent/[id]" options={{ title: t('agentPage.agent') }} />
      <Stack.Screen
        name="search-filters"
        options={{ presentation: 'modal', title: t('search.filters') }}
      />
      <Stack.Screen name="listings/[id]/index" options={{ title: t('listingForm.editTitle') }} />
      <Stack.Screen
        name="listings/[id]/scan"
        options={{ presentation: 'fullScreenModal', headerShown: false, gestureEnabled: false }}
      />
      <Stack.Screen
        name="listings/[id]/pin"
        options={{ title: t('listingForm.pin'), fullScreenGestureEnabled: false }}
      />
      <Stack.Screen name="listings/[id]/rooms" options={{ title: t('roomReview.title') }} />
      <Stack.Screen
        name="listings/[id]/divide"
        options={{ title: t('roomDivide.title'), fullScreenGestureEnabled: false }}
      />
      <Stack.Screen name="listings/[id]/entrance" options={{ title: t('entrance.title') }} />
      <Stack.Screen name="listings/[id]/photo-rooms" options={{ title: t('photoRooms.title') }} />
      <Stack.Screen name="scan-test" options={{ title: t('scanTest.title') }} />
      <Stack.Screen name="payment-test" options={{ title: t('payments.testTitle') }} />
      <Stack.Screen
        name="scan"
        options={{ presentation: 'fullScreenModal', headerShown: false, gestureEnabled: false }}
      />
      <Stack.Screen name="scans/[id]" options={{ title: t('scanResult.title') }} />
      <Stack.Screen name="sign-in" options={{ title: t('auth.title') }} />
      <Stack.Screen name="verify" options={{ title: t('auth.codeTitle') }} />
      <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  error: { flex: 1, justifyContent: 'center', gap: 16, padding: 24 },
  errorTitle: { fontSize: 22, fontWeight: '700' },
  errorBody: { fontSize: 16, lineHeight: 22 },
});
