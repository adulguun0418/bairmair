import { useSegments } from 'expo-router';
import * as Updates from 'expo-updates';
import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '@bairmair/native-ui/i18n';
import { captureError } from '@/lib/error-tracking';
import { Icon } from '@bairmair/native-ui/icon';
import { Text } from '@bairmair/native-ui/text';
import { radius, useColors } from '@bairmair/native-ui/theme';
import { shouldCheckOnForeground, shouldShowBanner } from './app-update-logic';

/**
 * "A new version is ready": shown once an over-the-air update has been downloaded, so the
 * visitor can restart into it at once instead of closing and reopening the app.
 *
 * expo-updates checks at every launch and downloads in the background (the launch itself never
 * waits). This also checks when the app returns to the foreground, since people rarely close
 * apps fully. Restarting is the visitor's choice; "later" leaves the update for the next launch.
 * Development builds have updates switched off and render nothing.
 */
export function UpdateBanner() {
  if (!Updates.isEnabled) return null;
  return <EnabledUpdateBanner />;
}

function EnabledUpdateBanner() {
  const { t } = useI18n();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const updates = Updates.useUpdates();
  const [dismissedUpdateId, setDismissedUpdateId] = useState<string | null>(null);
  const [restarting, setRestarting] = useState(false);

  useForegroundCheck(updates);

  const pendingUpdateId = updates.isUpdatePending
    ? (updates.downloadedUpdate?.updateId ?? 'rollback')
    : undefined;
  if (!shouldShowBanner({ pendingUpdateId, dismissedUpdateId, segments })) return null;

  const restart = () => {
    setRestarting(true);
    Updates.reloadAsync().catch((error: unknown) => {
      captureError(error, { boundary: 'update-banner' });
      setRestarting(false);
    });
  };

  return (
    <View pointerEvents="box-none" style={[styles.host, { top: insets.top + 6 }]}>
      <Animated.View
        entering={FadeInUp.duration(260)}
        exiting={FadeOutUp.duration(200)}
        accessibilityRole="alert"
        style={[styles.card, { backgroundColor: colors.ink, shadowColor: colors.shadow }]}
      >
        <View style={styles.head}>
          <View style={styles.iconDisc}>
            <Icon name="sparkle" size={16} color={colors.onInk} />
          </View>
          <View style={styles.texts}>
            <Text style={[styles.title, { color: colors.onInk }]}>{t('appUpdate.title')}</Text>
            <Text style={[styles.body, styles.muted]}>{t('appUpdate.body')}</Text>
          </View>
        </View>
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityHint={t('appUpdate.laterHint')}
            disabled={restarting}
            hitSlop={8}
            onPress={() => setDismissedUpdateId(pendingUpdateId ?? null)}
            style={({ pressed }) => [styles.later, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={[styles.laterText, styles.muted]}>{t('appUpdate.later')}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: restarting, busy: restarting }}
            disabled={restarting}
            onPress={restart}
            style={({ pressed }) => [
              styles.restart,
              { opacity: restarting ? 0.6 : pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={styles.restartText}>{t('appUpdate.restart')}</Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

/**
 * Back in the foreground: check for an update (at most every 15 minutes) and download it. The
 * download fills `useUpdates()`'s `isUpdatePending`, which shows the banner.
 */
function useForegroundCheck(updates: Updates.UseUpdatesReturnType) {
  // The listener is added once; it reads the latest state through this ref.
  const latest = useRef(updates);
  useEffect(() => {
    latest.current = updates;
  });
  const lastAttempt = useRef<Date | undefined>(undefined);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const current = latest.current;
      if (current.isUpdatePending) return;
      const checked = [current.lastCheckForUpdateTimeSinceRestart, lastAttempt.current]
        .filter((date): date is Date => date !== undefined)
        .sort((a, b) => b.getTime() - a.getTime())[0];
      const busy = current.isChecking || current.isDownloading || current.isStartupProcedureRunning;
      if (!shouldCheckOnForeground(checked, busy, new Date())) return;
      lastAttempt.current = new Date();
      void checkAndDownload();
    });
    return () => subscription.remove();
  }, []);
}

async function checkAndDownload() {
  try {
    const result = await Updates.checkForUpdateAsync();
    if (result.isAvailable) await Updates.fetchUpdateAsync();
  } catch {
    // Offline or EAS unreachable: the next launch or foreground tries again.
  }
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 12, right: 12 },
  card: {
    borderRadius: radius.lg,
    padding: 14,
    gap: 10,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 24,
    elevation: 8,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  iconDisc: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  texts: { flex: 1, gap: 2 },
  title: { fontSize: 16, lineHeight: 21, fontWeight: '700' },
  body: { fontSize: 14, lineHeight: 19 },
  muted: { color: 'rgba(255, 255, 255, 0.78)' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8 },
  later: { paddingHorizontal: 12, paddingVertical: 8 },
  laterText: { fontSize: 15, fontWeight: '600' },
  restart: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: radius.pill,
    backgroundColor: '#ffffff',
  },
  restartText: { fontSize: 15, fontWeight: '700', color: '#1a2b60' },
});
