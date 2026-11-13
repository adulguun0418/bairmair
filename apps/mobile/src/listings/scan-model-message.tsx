import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useI18n } from '@/i18n/i18n';
import { Button } from '@/ui/button';
import { useColors } from '@/ui/theme';
import { retryScanModel, type ScanModelState } from './scan-model';
import { Text } from '@/ui/text';

/** What to show while a scan's model is not ready: loading, not processed yet, or failed. */
export function ScanModelMessage({ state, scanId }: { state: ScanModelState; scanId: string }) {
  const { t } = useI18n();
  const colors = useColors();
  switch (state.status) {
    case 'ready':
      return null;
    case 'loading':
      return (
        <View style={styles.row}>
          <ActivityIndicator />
          <Text style={[styles.text, { color: colors.textMuted }]}>
            {t('listingScan.modelLoading')}
          </Text>
        </View>
      );
    case 'unavailable':
      return (
        <Text style={[styles.text, { color: colors.textMuted }]}>
          {t('listingScan.modelUnavailable')}
        </Text>
      );
    case 'error':
      return (
        <View style={styles.column}>
          <Text style={[styles.text, { color: colors.danger }]}>{t('listingScan.modelError')}</Text>
          <Button
            title={t('listingScan.retry')}
            variant="secondary"
            onPress={() => retryScanModel(scanId)}
          />
        </View>
      );
  }
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 },
  column: { gap: 8 },
  text: { fontSize: 15, lineHeight: 21 },
});
