import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { AuthProvider } from '@/auth/auth-provider';
import { startFavorites } from '@/browse/favorites';
import { I18nProvider, useI18n } from '@/i18n/i18n';
import { startListingSync } from '@/listings/listings';

export const unstable_settings = {
  // Deep links into a pushed screen still get the tabs underneath to go back to.
  initialRouteName: '(tabs)',
};

export default function RootLayout() {
  const scheme = useColorScheme();
  // Listings sync whenever the app is open, whichever screen is showing.
  useEffect(startListingSync, []);
  // Saved listings follow the signed-in user.
  useEffect(startFavorites, []);
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
