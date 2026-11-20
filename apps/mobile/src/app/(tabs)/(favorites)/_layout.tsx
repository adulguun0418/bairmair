import { Stack } from 'expo-router';
import { useI18n } from '@bairmair/native-ui/i18n';

export default function FavoritesTabLayout() {
  const { t } = useI18n();
  return (
    <Stack>
      <Stack.Screen
        name="favorites"
        options={{ title: t('favorites.title'), headerLargeTitle: true }}
      />
    </Stack>
  );
}
