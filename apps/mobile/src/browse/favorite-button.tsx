import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Alert, Pressable, StyleSheet } from 'react-native';
import { useI18n } from '@/i18n/i18n';
import { useColors } from '@/ui/theme';
import { SignedOutError, toggleFavorite, useIsFavorite } from './favorites';
import { Text } from '@/ui/text';

/** A heart that saves the listing; signed out, it opens sign-in. */
export function FavoriteButton({
  listingId,
  size = 24,
  onImage = false,
}: {
  listingId: string;
  size?: number;
  /** Drawn over a photo: white with a shadow. */
  onImage?: boolean;
}) {
  const { t } = useI18n();
  const colors = useColors();
  const router = useRouter();
  const saved = useIsFavorite(listingId);

  const press = () => {
    toggleFavorite(listingId).catch((error: unknown) => {
      if (error instanceof SignedOutError) {
        Alert.alert(t('favorites.signIn'), undefined, [
          { text: t('account.cancel'), style: 'cancel' },
          { text: t('account.signIn'), onPress: () => router.push('/sign-in') },
        ]);
      } else {
        Alert.alert(t('favorites.failed'));
      }
    });
  };

  const tint = saved ? colors.favorite : onImage ? '#ffffff' : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={saved ? t('favorites.remove') : t('favorites.save')}
      accessibilityState={{ selected: saved }}
      hitSlop={10}
      onPress={press}
      style={({ pressed }) => [
        styles.button,
        onImage && styles.onImage,
        { opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <SymbolView
        name={saved ? 'heart.fill' : 'heart'}
        size={size}
        tintColor={tint}
        fallback={<Text style={{ color: tint, fontSize: size }}>{saved ? '♥' : '♡'}</Text>}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', justifyContent: 'center', padding: 4 },
  onImage: {
    shadowColor: '#000000',
    shadowOpacity: 0.45,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
});
