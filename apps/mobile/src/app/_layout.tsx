import { Onest_400Regular } from '@expo-google-fonts/onest/400Regular';
import { Onest_500Medium } from '@expo-google-fonts/onest/500Medium';
import { Onest_600SemiBold } from '@expo-google-fonts/onest/600SemiBold';
import { Onest_700Bold } from '@expo-google-fonts/onest/700Bold';
import { Onest_800ExtraBold } from '@expo-google-fonts/onest/800ExtraBold';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { AuthProvider } from '@/auth/auth-provider';
import { startFavorites } from '@/browse/favorites';
import { I18nProvider, useI18n } from '@/i18n/i18n';
import { startListingSync } from '@/listings/listings';
import { FONT_FAMILIES, useColors, type Colors } from '@/ui/theme';

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
  const ready = fontsLoaded || fontError !== null;
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
      <AuthProvider>
        <ThemeProvider value={navigationTheme(colors, dark, fontsLoaded)}>
          <StatusBar style="auto" />
          <RootStack />
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
      <Stack.Screen name="listings/[id]/photo-rooms" options={{ title: t('photoRooms.title') }} />
      <Stack.Screen name="scan-test" options={{ title: t('scanTest.title') }} />
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
