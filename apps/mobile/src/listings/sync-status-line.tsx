import type { Translator } from '@bairmair/i18n';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useI18n } from '@/i18n/i18n';
import { useColors, type Colors } from '@/ui/theme';
import { retrySyncNow, useSyncStatus } from './listings';
import type { LocalListing } from './model';
import type { SyncStatus } from './sync-engine';
import { isSynced, pendingPhotoCount, scanProgress } from './sync-plan';
import { Text } from '@/ui/text';

type Tone = 'muted' | 'success' | 'warning' | 'danger';

export function describeSync(
  t: Translator,
  listing: LocalListing,
  status: SyncStatus,
  nowMs: number,
): { text: string; tone: Tone; canRetry: boolean } {
  const pending = pendingPhotoCount(listing);
  switch (status.state) {
    case 'signedOut':
      return { text: t('listings.sync.signedOut'), tone: 'warning', canRetry: false };
    case 'failed':
      return {
        text: `${t('listings.sync.failed')} ${t(`listings.syncErrors.${status.key}`)}`,
        tone: 'danger',
        canRetry: false,
      };
    case 'waiting': {
      const seconds = Math.max(0, Math.ceil((status.retryAt - nowMs) / 1000));
      return {
        text: `${t(`listings.syncErrors.${status.key}`)} ${t('listings.sync.waiting', { seconds })}`,
        tone: 'warning',
        canRetry: true,
      };
    }
    case 'blocked':
      switch (status.block) {
        case 'needsTitle':
          return { text: t('listings.sync.needsTitle'), tone: 'muted', canRetry: false };
        case 'invalidFields':
          return { text: t('listings.sync.invalidFields'), tone: 'warning', canRetry: false };
        case 'incompleteForLive':
          return { text: t('listings.sync.incompleteForLive'), tone: 'warning', canRetry: false };
      }
      break;
    case 'syncing':
    case 'idle': {
      if (status.state === 'idle' && isSynced(listing)) {
        return { text: t('listings.sync.synced'), tone: 'success', canRetry: false };
      }
      const scan = scanProgress(listing);
      const text =
        pending > 0
          ? t('listings.sync.photos', { count: pending })
          : scan === 'uploading'
            ? t('listings.sync.scanUploading')
            : scan === 'processing'
              ? t('listings.sync.scanProcessing')
              : t('listings.sync.syncing');
      return { text, tone: 'muted', canRetry: false };
    }
  }
}

function toneColor(colors: Colors, tone: Tone): string {
  return tone === 'muted' ? colors.textMuted : colors[tone];
}

/** One line telling the seller whether the listing has reached the server. */
export function SyncStatusLine({ listing }: { listing: LocalListing }) {
  const { t } = useI18n();
  const colors = useColors();
  const status = useSyncStatus(listing.id);
  const [now, setNow] = useState(() => Date.now());

  // Count down while waiting for a retry.
  const waiting = status.state === 'waiting';
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [waiting]);

  const { text, tone, canRetry } = describeSync(t, listing, status, now);
  return (
    <View style={styles.row}>
      <Text style={[styles.text, { color: toneColor(colors, tone) }]}>{text}</Text>
      {canRetry && (
        <Pressable accessibilityRole="button" onPress={retrySyncNow} hitSlop={8}>
          <Text style={[styles.retry, { color: colors.accent }]}>{t('listings.sync.retry')}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  text: { flex: 1, fontSize: 14, lineHeight: 20 },
  retry: { fontSize: 14, fontWeight: '600' },
});
