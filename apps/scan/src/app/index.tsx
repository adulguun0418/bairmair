import { formatFileSize } from '@bairmair/i18n';
import { BlueprintPanel } from '@bairmair/native-ui/blueprint-panel';
import { Button } from '@bairmair/native-ui/button';
import { useI18n } from '@bairmair/native-ui/i18n';
import { Icon } from '@bairmair/native-ui/icon';
import { Text } from '@bairmair/native-ui/text';
import { radius, useColors } from '@bairmair/native-ui/theme';
import { canStartScan, formatScanTime, supportMessage } from '@bairmair/scanner';
import { listScans, scanSupport, type SavedScan } from '@bairmair/scanner/native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

/**
 * "Миний сканууд". Step 1: the scans saved on this phone and the button to start one. Uploading,
 * links and the free-scan count come in later steps.
 */
export default function HomeScreen() {
  const { t, locale } = useI18n();
  const colors = useColors();
  const router = useRouter();
  const [scans, setScans] = useState<SavedScan[]>([]);
  const canScan = canStartScan(scanSupport);

  useFocusEffect(
    useCallback(() => {
      setScans(listScans());
    }, []),
  );

  const startScan = () => router.push('/scan');

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('scanApp.diagnostics.title')}
              hitSlop={12}
              onPress={() => router.push('/diagnostics')}
            >
              <Icon name="wrench" size={20} color={colors.text} />
            </Pressable>
          ),
        }}
      />
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
      >
        {!canScan ? (
          <BlueprintPanel
            icon="warning"
            title={t('scanApp.cannotScanTitle')}
            body={supportMessage(t, scanSupport)}
          />
        ) : scans.length === 0 ? (
          <BlueprintPanel
            icon="cube"
            eyebrow={t('scanApp.emptyEyebrow')}
            title={t('scanApp.emptyTitle')}
            body={t('scanApp.emptyBody')}
          >
            <Button title={t('scanApp.newScan')} icon="camera" paper onPress={startScan} />
          </BlueprintPanel>
        ) : (
          <Button title={t('scanApp.newScan')} icon="camera" onPress={startScan} />
        )}

        {scans.length > 0 && (
          <View style={styles.list}>
            <Text style={[styles.eyebrow, { color: colors.textSubtle }]}>
              {t('scanApp.savedOnPhone').toUpperCase()}
            </Text>
            {scans.map((scan) => (
              <Pressable
                key={scan.meta.id}
                accessibilityRole="button"
                onPress={() =>
                  router.push({ pathname: '/scans/[id]', params: { id: scan.meta.id } })
                }
                style={({ pressed }) => [
                  styles.row,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <View style={[styles.badge, { backgroundColor: colors.accentSoft }]}>
                  <Icon name="cube" size={20} color={colors.brand} />
                </View>
                <View style={styles.rowText}>
                  <Text style={[styles.rowTitle, { color: colors.text }]}>
                    {formatScanTime(scan.meta.createdAt) || scan.meta.id}
                  </Text>
                  <Text style={[styles.small, { color: colors.textMuted }]}>
                    {formatFileSize(scan.rawJson.size, locale)}
                  </Text>
                </View>
                <Icon name="chevron" size={16} color={colors.textSubtle} />
              </Pressable>
            ))}
          </View>
        )}

        <Text style={[styles.small, { color: colors.textMuted }]}>{t('scanApp.testNote')}</Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 20, paddingBottom: 40 },
  list: { gap: 10 },
  eyebrow: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 1.1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  badge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 16, fontWeight: '600' },
  small: { fontSize: 14, lineHeight: 20 },
});
