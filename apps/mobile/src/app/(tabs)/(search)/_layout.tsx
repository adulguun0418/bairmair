import { Stack } from 'expo-router';
import { useI18n } from '@/i18n/i18n';

export default function SearchTabLayout() {
  const { t } = useI18n();
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: t('search.title') }} />
    </Stack>
  );
}
