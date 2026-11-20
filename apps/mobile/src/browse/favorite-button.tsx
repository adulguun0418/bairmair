import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Alert, Pressable, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useAuth } from '@bairmair/native-auth';
import { useI18n } from '@bairmair/native-ui/i18n';
import { useColors } from '@bairmair/native-ui/theme';
import { SignedOutError, toggleFavorite, useIsFavorite } from './favorites';
import { Text } from '@bairmair/native-ui/text';

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
  const signedIn = Boolean(useAuth().session);
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  const press = () => {
    // Saving pops the heart (only on the user's own tap, never when the list re-renders).
    if (!saved && signedIn && !reduceMotion) {
      scale.set(
        withSequence(
          withTiming(1.35, { duration: 110 }),
          withSpring(1, { damping: 7, stiffness: 260 }),
        ),
      );
    }
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
      <Animated.View style={popStyle}>
        <SymbolView
          name={saved ? 'heart.fill' : 'heart'}
          size={size}
          tintColor={tint}
          fallback={<Text style={{ color: tint, fontSize: size }}>{saved ? '♥' : '♡'}</Text>}
        />
      </Animated.View>
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
