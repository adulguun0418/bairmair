import { formatArea } from '@bairmair/i18n';
import { useRouter } from 'expo-router';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '@/i18n/i18n';
import { scanSupport } from '@/scanner/device';
import { supportMessage } from '@/scanner/support-message';
import { canStartScan } from '@/scanner/support';
import { Button } from '@/ui/button';
import { ScanFloorPlan } from '@/ui/scan-floor-plan';
import { useColors, type Colors } from '@/ui/theme';
import { removeListingScan } from './listings';
import type { LocalListing } from './model';
import { useScanModel } from './scan-model';
import { ScanModelMessage } from './scan-model-message';
import { scanProgress } from './sync-plan';

/** The listing's 3D scan in the editor: start one, or see and manage the current one. */
export function ScanSection({ listing }: { listing: LocalListing }) {
  const { t, locale } = useI18n();
  const colors = useColors();
  const router = useRouter();
  const state = useScanModel(listing);
  const scan = listing.scan;
  const canScan = canStartScan(scanSupport);
  const id = listing.id;

  const startScan = () => router.push({ pathname: '/listings/[id]/scan', params: { id } });

  if (!scan) {
    return (
      <View style={styles.column}>
        <Text style={[styles.body, { color: colors.textMuted }]}>{t('listingScan.intro')}</Text>
        {canScan ? (
          <Button title={t('listingScan.start')} onPress={startScan} />
        ) : (
          <Text style={[styles.small, { color: colors.textMuted }]}>
            {supportMessage(t, scanSupport)} {t('listingScan.otherDevices')}
          </Text>
        )}
      </View>
    );
  }

  const progress = scanProgress(listing);
  const ready = state?.status === 'ready' ? state : null;
  const totalArea = scan.totalAreaM2 ?? ready?.metrics.totalAreaM2 ?? null;
  const incomplete = ready?.incompleteRoomIds.length ?? 0;
  const assigned = listing.photos.filter((photo) => photo.roomId !== null).length;

  const confirmRescan = () =>
    Alert.alert(t('listingScan.rescanTitle'), t('listingScan.rescanBody'), [
      { text: t('listingScan.cancel'), style: 'cancel' },
      { text: t('listingScan.rescanConfirm'), onPress: startScan },
    ]);
  const confirmRemove = () =>
    Alert.alert(t('listingScan.removeTitle'), t('listingScan.removeBody'), [
      { text: t('listingScan.cancel'), style: 'cancel' },
      {
        text: t('listingScan.removeConfirm'),
        style: 'destructive',
        onPress: () => removeListingScan(id),
      },
    ]);

  return (
    <View style={styles.column}>
      {ready ? (
        <ScanFloorPlan model={ready.model} height={260} />
      ) : (
        state && <ScanModelMessage state={state} scanId={scan.id} />
      )}

      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        {totalArea !== null && (
          <Text style={[styles.body, styles.bold, { color: colors.text }]}>
            {t('listingScan.total', { area: formatArea(totalArea, locale) })}
          </Text>
        )}
        {totalArea !== null && (
          <Text style={[styles.small, { color: colors.textMuted }]}>
            {t('viewer.approximateScanned')}
          </Text>
        )}
        {progress !== 'none' && (
          <Text style={[styles.small, { color: progressColor(colors, progress) }]}>
            {t(`listingScan.status.${progress}`)}
          </Text>
        )}
        {incomplete > 0 && (
          <Text style={[styles.small, { color: colors.warning }]}>
            {t('listingScan.incompleteRooms', { count: incomplete })}
          </Text>
        )}
        <Text style={[styles.small, { color: colors.textMuted }]}>
          {scan.location
            ? t('listingScan.located', { meters: scan.location.accuracyM ?? '?' })
            : t('listingScan.notLocated')}
        </Text>
      </View>

      <Button
        title={t('listingScan.reviewRooms')}
        variant="secondary"
        onPress={() => router.push({ pathname: '/listings/[id]/rooms', params: { id } })}
      />
      {listing.photos.length > 0 && (
        <>
          <Button
            title={t('listingScan.assignPhotos')}
            variant="secondary"
            onPress={() => router.push({ pathname: '/listings/[id]/photo-rooms', params: { id } })}
          />
          <Text style={[styles.small, { color: colors.textMuted }]}>
            {t('listingScan.assignedCount', { assigned, total: listing.photos.length })}
          </Text>
        </>
      )}
      {canScan && (
        <Button title={t('listingScan.rescan')} variant="secondary" onPress={confirmRescan} />
      )}
      <Button title={t('listingScan.remove')} variant="secondary" onPress={confirmRemove} />
    </View>
  );
}

function progressColor(colors: Colors, progress: ReturnType<typeof scanProgress>): string {
  switch (progress) {
    case 'ready':
      return colors.success;
    case 'failed':
      return colors.danger;
    default:
      return colors.textMuted;
  }
}

const styles = StyleSheet.create({
  column: { gap: 12 },
  card: { borderRadius: 12, padding: 14, gap: 6 },
  body: { fontSize: 16, lineHeight: 22 },
  bold: { fontWeight: '700' },
  small: { fontSize: 14, lineHeight: 20 },
});
