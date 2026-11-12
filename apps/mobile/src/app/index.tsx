import { formatFileSize, LOCALES, type Translator } from '@bairmair/i18n';
import * as Device from 'expo-device';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '@/i18n/i18n';
import { deviceFacts, scanSupport } from '@/scanner/device';
import { formatScanTime } from '@/scanner/scan-meta';
import { listScans, type SavedScan } from '@/scanner/storage';
import { canStartScan, type ScanSupport } from '@/scanner/support';
import { Button } from '@/ui/button';
import { useColors } from '@/ui/theme';

function supportMessage(t: Translator, support: ScanSupport): string {
  switch (support.status) {
    case 'supported':
      return t('scanSupport.supported');
    case 'unverified':
      return t('scanSupport.unverified');
    case 'unsupported':
      switch (support.reason) {
        case 'not-ios':
          return t('scanSupport.notIos');
        case 'simulator':
          return t('scanSupport.simulator');
        case 'os-too-old':
          return t('scanSupport.osTooOld');
        case 'no-lidar':
          return t('scanSupport.noLidar');
      }
  }
}

/** Step 4 test screen: device check, start a scan, list the scans saved on this phone. */
export default function HomeScreen() {
  const { t, locale, setLocale } = useI18n();
  const colors = useColors();
  const router = useRouter();
  const [scans, setScans] = useState<SavedScan[]>([]);

  useFocusEffect(
    useCallback(() => {
      setScans(listScans());
    }, []),
  );

  const statusColor =
    scanSupport.status === 'supported'
      ? colors.success
      : scanSupport.status === 'unverified'
        ? colors.warning
        : colors.danger;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Text style={[styles.muted, { color: colors.textMuted }]}>{t('scanTest.intro')}</Text>

      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <Text style={[styles.heading, { color: colors.text }]}>{t('scanTest.device')}</Text>
        <Text style={[styles.mono, { color: colors.text }]}>
          {Device.modelName ?? '—'} · {deviceFacts.modelId ?? '—'} · {Device.osName ?? '—'}{' '}
          {deviceFacts.osVersion ?? ''}
        </Text>
        <Text style={[styles.body, { color: statusColor }]}>{supportMessage(t, scanSupport)}</Text>
      </View>

      <Button
        title={t('scan.start')}
        disabled={!canStartScan(scanSupport)}
        onPress={() => router.push('/scan')}
      />

      <Text style={[styles.heading, { color: colors.text }]}>{t('scanTest.savedScans')}</Text>
      {scans.length === 0 ? (
        <Text style={[styles.muted, { color: colors.textMuted }]}>{t('scanTest.noScans')}</Text>
      ) : (
        scans.map((scan) => (
          <Pressable
            key={scan.meta.id}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/scans/[id]', params: { id: scan.meta.id } })}
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[styles.body, { color: colors.text }]}>
              {formatScanTime(scan.meta.createdAt) || scan.meta.id}
            </Text>
            <Text style={[styles.muted, { color: colors.textMuted }]}>
              {formatFileSize(scan.rawJson.size, locale)}
            </Text>
          </Pressable>
        ))
      )}

      <View style={styles.languages}>
        {LOCALES.map((option) => (
          <Button
            key={option}
            title={t(`language.${option}`)}
            variant={option === locale ? 'primary' : 'secondary'}
            onPress={() => setLocale(option)}
            style={styles.grow}
          />
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16 },
  card: { borderRadius: 12, padding: 16, gap: 8 },
  heading: { fontSize: 18, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 22 },
  muted: { fontSize: 15, lineHeight: 21 },
  mono: { fontSize: 14, fontFamily: 'Menlo' },
  row: {
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  languages: { flexDirection: 'row', gap: 12, marginTop: 8 },
  grow: { flex: 1 },
});
