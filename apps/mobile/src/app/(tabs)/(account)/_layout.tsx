import { Stack } from 'expo-router';
import { useI18n } from '@/i18n/i18n';

export default function AccountTabLayout() {
  const { t } = useI18n();
  return (
    <Stack>
      <Stack.Screen
        name="account"
        options={{ title: t('account.title'), headerLargeTitle: true }}
      />
    </Stack>
  );
}
