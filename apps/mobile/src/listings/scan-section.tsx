import { formatArea } from '@bairmair/i18n';
import { useRouter } from 'expo-router';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useI18n } from '@/i18n/i18n';
import { scanSupport } from '@/scanner/device';
import { supportMessage } from '@/scanner/support-message';
import { canStartScan } from '@/scanner/support';
import { BlueprintPanel, PAPER_INK_MUTED } from '@/ui/blueprint-panel';
import { Button } from '@/ui/button';
import { BlueprintGrid } from '@/ui/blueprint';
import { Icon, type IconName } from '@/ui/icon';
import { ScanFloorPlan } from '@/ui/scan-floor-plan';
import { PAPER, PAPER_GRID, radius, useColors, type Colors } from '@/ui/theme';
import { removeListingScan } from './listings';
import type { LocalListing } from './model';
import { useScanModel } from './scan-model';
import { ScanModelMessage } from './scan-model-message';
import { scanProgress } from './sync-plan';
import { Text } from '@/ui/text';

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
      <BlueprintPanel
        icon="view3d"
        eyebrow={t('seller.scanIntro.eyebrow')}
        title={t('seller.scanIntro.panelTitle')}
        body={t('listingScan.intro')}
      >
        {canScan ? (
          <>
            <View style={styles.duration}>
              <Icon name="clock" size={14} color={PAPER_INK_MUTED} />
              <Text style={[styles.small, { color: PAPER_INK_MUTED }]}>
                {t('seller.scanIntro.duration')}
              </Text>
            </View>
            <Button title={t('listingScan.start')} icon="view3d" paper onPress={startScan} />
          </>
        ) : (
          <Text style={[styles.small, { color: PAPER_INK_MUTED }]}>
            {supportMessage(t, scanSupport)} {t('listingScan.otherDevices')}
          </Text>
        )}
      </BlueprintPanel>
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
        <View style={styles.paper}>
          <BlueprintGrid color={PAPER_GRID} />
          <ScanFloorPlan model={ready.model} height={260} />
        </View>
      ) : (
        state && <ScanModelMessage state={state} scanId={scan.id} />
      )}

      <View style={[styles.card, { backgroundColor: colors.surface2 }]}>
        {totalArea !== null && (
          <View style={styles.total}>
            <Icon name="ruler" size={20} color={colors.brand} />
            <Text style={[styles.totalValue, { color: colors.text }]}>
              ≈ {formatArea(totalArea, locale)}
            </Text>
            <Text style={[styles.small, styles.grow, { color: colors.textMuted }]}>
              {t('viewer.approximateScanned')}
            </Text>
          </View>
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

      <View style={[styles.rows, { backgroundColor: colors.surface2 }]}>
        <ActionRow
          icon="rooms"
          title={t('listingScan.reviewRooms')}
          onPress={() => router.push({ pathname: '/listings/[id]/rooms', params: { id } })}
        />
        {listing.photos.length > 0 && (
          <ActionRow
            icon="photos"
            title={t('listingScan.assignPhotos')}
            detail={t('listingScan.assignedCount', { assigned, total: listing.photos.length })}
            onPress={() => router.push({ pathname: '/listings/[id]/photo-rooms', params: { id } })}
            divider
          />
        )}
      </View>
      <View style={styles.pair}>
        {canScan && (
          <Button
            title={t('listingScan.rescan')}
            icon="view3d"
            variant="outline"
            size="small"
            onPress={confirmRescan}
            style={styles.grow}
          />
        )}
        <Button
          title={t('listingScan.remove')}
          icon="trash"
          variant="outline"
          size="small"
          onPress={confirmRemove}
          style={styles.grow}
        />
      </View>
    </View>
  );
}

/** A row that opens a screen: icon, title, an optional detail line, chevron. */
function ActionRow({
  icon,
  title,
  detail,
  onPress,
  divider,
}: {
  icon: IconName;
  title: string;
  detail?: string;
  onPress: () => void;
  divider?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        divider && { borderTopWidth: 1, borderTopColor: colors.border },
        { opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <Icon name={icon} size={18} color={colors.brand} />
      <View style={styles.grow}>
        <Text style={[styles.body, styles.strong, { color: colors.text }]}>{title}</Text>
        {detail ? <Text style={[styles.small, { color: colors.textMuted }]}>{detail}</Text> : null}
      </View>
      <Icon name="chevron" size={14} color={colors.textSubtle} />
    </Pressable>
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
  card: { borderRadius: radius.md, padding: 14, gap: 6 },
  duration: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  body: { fontSize: 16, lineHeight: 22 },
  strong: { fontWeight: '600' },
  grow: { flex: 1 },
  pair: { flexDirection: 'row', gap: 10 },
  paper: { borderRadius: radius.md, backgroundColor: PAPER, overflow: 'hidden' },
  total: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  totalValue: { fontSize: 24, fontWeight: '800', letterSpacing: -0.6 },
  rows: { borderRadius: radius.md, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  small: { fontSize: 14, lineHeight: 20 },
});
