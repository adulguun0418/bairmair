import { useI18n } from '@bairmair/native-ui/i18n';
import { Text } from '@bairmair/native-ui/text';
import { useColors } from '@bairmair/native-ui/theme';
import { formatScanTime } from '@bairmair/scanner';
import { getScan, ScanReport } from '@bairmair/scanner/native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

/** Review of one scan saved by the RoomPlan test screen (the report is shared with bairmair scan). */
export default function ScanResultScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const colors = useColors();
  const scan = useMemo(() => getScan(id), [id]);

  if (!scan) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text }}>{t('scanResult.notFound')}</Text>
      </View>
    );
  }
  return (
    <>
      <Stack.Screen
        options={{ title: formatScanTime(scan.meta.createdAt) || t('scanResult.title') }}
      />
      <ScanReport scan={scan} onDeleted={() => router.back()} />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
