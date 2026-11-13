import { Stack } from 'expo-router';
import { useI18n } from '@/i18n/i18n';

export default function MineTabLayout() {
  const { t } = useI18n();
  return (
    <Stack>
      <Stack.Screen name="mine" options={{ title: t('listings.title'), headerLargeTitle: true }} />
    </Stack>
  );
}
