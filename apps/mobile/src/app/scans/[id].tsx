import { formatArea, formatFileSize, roomDisplayName } from '@bairmair/i18n';
import { renderFloorPlanSvg } from '@bairmair/room-model';
import type { File } from 'expo-file-system';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useMemo } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '@/i18n/i18n';
import { analyzeExport } from '@/scanner/analyze';
import { formatScanTime } from '@/scanner/scan-meta';
import { deleteScan, getScan, writeModelJson } from '@/scanner/storage';
import { Button } from '@/ui/button';
import { FloorPlanView } from '@/ui/floor-plan-view';
import { useColors } from '@/ui/theme';

const JSON_TYPE = { mimeType: 'application/json', UTI: 'public.json' };
const USDZ_TYPE = {
  mimeType: 'model/vnd.usdz+zip',
  UTI: 'com.pixar.universal-scene-description-mobile',
};

async function share(file: File, type: { mimeType: string; UTI: string }) {
  if (!(await Sharing.isAvailableAsync())) return;
  try {
    await Sharing.shareAsync(file.uri, type);
  } catch {
    // Dismissing the share sheet is not an error worth showing.
  }
}

/** Review of one saved scan: the converted model, its floor plan, and the files to share. */
export default function ScanResultScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t, locale } = useI18n();
  const colors = useColors();

  // Converting reads and parses the whole raw file; a few MB take well under a second.
  const scan = useMemo(() => getScan(id), [id]);
  const analysis = useMemo(() => (scan ? analyzeExport(scan.rawJson.textSync()) : null), [scan]);
  const svg = useMemo(
    () =>
      analysis?.ok
        ? renderFloorPlanSvg(analysis.model, {
            text: {
              roomName: (room) => roomDisplayName(t, room),
              area: (squareMeters) => formatArea(squareMeters, locale),
            },
            title: t('viewer.viewPlan'),
            showHotspots: false,
          })
        : null,
    [analysis, t, locale],
  );

  if (!scan || !analysis) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text }}>{t('scanResult.notFound')}</Text>
      </View>
    );
  }

  const confirmDelete = () =>
    Alert.alert(t('scanResult.deleteTitle'), t('scanResult.deleteBody'), [
      { text: t('scanResult.keep'), style: 'cancel' },
      {
        text: t('scanResult.deleteConfirm'),
        style: 'destructive',
        onPress: () => {
          deleteScan(scan.meta.id);
          router.back();
        },
      },
    ]);

  const shareModel = async () => {
    if (!analysis.ok) return;
    const file = await writeModelJson(scan.meta.id, JSON.stringify(analysis.model, null, 2));
    await share(file, JSON_TYPE);
  };

  const text = { color: colors.text };
  const muted = { color: colors.textMuted };
  const device = scan.meta.device;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Stack.Screen
        options={{ title: formatScanTime(scan.meta.createdAt) || t('scanResult.title') }}
      />
      <Text style={[styles.mono, muted]}>
        {scan.meta.id}
        {device ? ` · ${device.modelId ?? '—'} · iOS ${device.osVersion ?? '—'}` : ''}
      </Text>

      {analysis.ok ? (
        <>
          {svg && <FloorPlanView svg={svg} />}

          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <Text style={[styles.heading, text]}>{t('viewer.rooms')}</Text>
            {analysis.model.rooms.map((room, index) => (
              <View key={room.id} style={styles.line}>
                <Text style={[styles.body, text]}>{roomDisplayName(t, room)}</Text>
                <Text style={[styles.body, text]}>
                  {formatArea(analysis.metrics.rooms[index]?.areaM2 ?? 0, locale)}
                </Text>
              </View>
            ))}
            <View style={[styles.line, styles.total, { borderColor: colors.border }]}>
              <Text style={[styles.body, styles.bold, text]}>{t('viewer.totalArea')}</Text>
              <Text style={[styles.body, styles.bold, text]}>
                {formatArea(analysis.metrics.totalAreaM2, locale)}
              </Text>
            </View>
            <Text style={[styles.small, muted]}>{t('viewer.approximateScanned')}</Text>
          </View>

          <Text style={[styles.small, muted]}>
            {t('scanResult.counts', {
              walls: analysis.metrics.counts.walls,
              doors: analysis.metrics.counts.doors,
              windows: analysis.metrics.counts.windows,
              openings: analysis.metrics.counts.openings,
              objects: analysis.metrics.counts.objects,
            })}
          </Text>
          {analysis.warningCount > 0 && (
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <Text style={[styles.body, { color: colors.warning }]}>
                {t('scanResult.warnings', { count: analysis.warningCount })}
              </Text>
              {Object.entries(analysis.warnings).map(([code, count]) => (
                <Text key={code} style={[styles.mono, muted]}>
                  {code} × {count}
                </Text>
              ))}
            </View>
          )}
        </>
      ) : (
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.body, { color: colors.danger }]}>
            {t('scanResult.convertFailed')}
          </Text>
          <Text style={[styles.mono, muted]}>{analysis.error}</Text>
        </View>
      )}

      <Text style={[styles.heading, text]}>{t('scanResult.files')}</Text>
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <View style={styles.line}>
          <Text style={[styles.body, text]}>{t('scanResult.rawJson')}</Text>
          <Text style={[styles.body, muted]}>{formatFileSize(scan.rawJson.size, locale)}</Text>
        </View>
        <Button title={t('scanResult.share')} onPress={() => void share(scan.rawJson, JSON_TYPE)} />
        {scan.usdz && (
          <>
            <View style={styles.line}>
              <Text style={[styles.body, text]}>{t('scanResult.usdz')}</Text>
              <Text style={[styles.body, muted]}>{formatFileSize(scan.usdz.size, locale)}</Text>
            </View>
            <Button
              title={t('scanResult.share')}
              variant="secondary"
              onPress={() => scan.usdz && void share(scan.usdz, USDZ_TYPE)}
            />
          </>
        )}
        {analysis.ok && (
          <>
            <Text style={[styles.body, text]}>{t('scanResult.model')}</Text>
            <Button
              title={t('scanResult.share')}
              variant="secondary"
              onPress={() => void shareModel()}
            />
          </>
        )}
      </View>

      <Button title={t('scanResult.delete')} variant="danger" onPress={confirmDelete} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: 12, padding: 16, gap: 10 },
  heading: { fontSize: 18, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 22 },
  bold: { fontWeight: '700' },
  small: { fontSize: 14, lineHeight: 20 },
  mono: { fontSize: 13, fontFamily: 'Menlo' },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  total: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
});
