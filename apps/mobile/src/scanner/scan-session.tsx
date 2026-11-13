import { StyleSheet, View } from 'react-native';
import { useI18n } from '@/i18n/i18n';
import { Button } from '@/ui/button';
import { useColors } from '@/ui/theme';
import type { ScanSessionProps } from './scan-session.types';
import { Text } from '@/ui/text';

/**
 * Fallback for platforms without RoomPlan. The real scanner is `scan-session.ios.tsx`; it is kept
 * in an iOS-only file because expo-roomplan's Android view throws when it is created.
 */
export function ScanSession({ onCancel }: ScanSessionProps) {
  const { t } = useI18n();
  const colors = useColors();
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Text style={[styles.message, { color: colors.text }]}>{t('scanSupport.notIos')}</Text>
      <Button title={t('scan.close')} onPress={onCancel} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', padding: 24, gap: 16 },
  message: { fontSize: 16, textAlign: 'center' },
});
