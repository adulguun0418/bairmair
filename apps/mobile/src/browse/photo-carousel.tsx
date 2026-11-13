import type { ListingPhoto } from '@bairmair/browse';
import { Image } from 'expo-image';
import { useState } from 'react';
import { FlatList, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useI18n } from '@/i18n/i18n';
import { useColors } from '@/ui/theme';

/** The listing's photos, swiped one by one, with "Зураг 2 / 9". */
export function PhotoCarousel({
  photos,
  roomNames,
}: {
  photos: readonly ListingPhoto[];
  /** Room names by id, shown on photos the seller put in a room of the scan. */
  roomNames: ReadonlyMap<string, string>;
}) {
  const { t } = useI18n();
  const colors = useColors();
  const { width } = useWindowDimensions();
  const height = Math.round((width * 3) / 4);
  const [index, setIndex] = useState(0);

  if (photos.length === 0) {
    return (
      <View style={[styles.empty, { height, backgroundColor: colors.surface }]}>
        <Text style={{ color: colors.textMuted }}>{t('listingPage.noPhotos')}</Text>
      </View>
    );
  }

  const current = photos[index];
  const room = current?.roomId ? roomNames.get(current.roomId) : undefined;

  return (
    <View style={{ height }}>
      <FlatList
        data={photos}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(photo) => photo.id}
        onMomentumScrollEnd={(event) =>
          setIndex(Math.round(event.nativeEvent.contentOffset.x / width))
        }
        renderItem={({ item, index: position }) => (
          <Image
            source={{ uri: item.src }}
            style={{ width, height, backgroundColor: colors.surface }}
            contentFit="cover"
            transition={150}
            accessibilityLabel={t('listingPage.photo', {
              index: position + 1,
              total: photos.length,
            })}
          />
        )}
      />
      <View style={styles.overlay} pointerEvents="none">
        {room ? <Text style={styles.chip}>{room}</Text> : <View />}
        <Text style={styles.chip}>
          {t('listingPage.photo', { index: index + 1, total: photos.length })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', justifyContent: 'center' },
  overlay: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  chip: {
    color: '#ffffff',
    backgroundColor: 'rgba(0,0,0,0.55)',
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
});
