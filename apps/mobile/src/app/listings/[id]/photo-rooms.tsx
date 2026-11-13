import { roomDisplayName } from '@bairmair/i18n';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useI18n } from '@/i18n/i18n';
import { editListing, photoUri, useLocalListing } from '@/listings/listings';
import { assignPhotoRoom, type LocalListing } from '@/listings/model';
import { useScanModel } from '@/listings/scan-model';
import { ScanModelMessage } from '@/listings/scan-model-message';
import { Button } from '@/ui/button';
import { ChoiceChips } from '@/ui/choice-chips';
import { useColors } from '@/ui/theme';
import { Text } from '@/ui/text';

/** "No room" as a chip value (ChoiceChips values are strings here). */
const NO_ROOM = '';

/**
 * The photo step: the seller picks the room each photo was taken in. Buyers then see the photos
 * as hotspots in that room of the 3D model.
 */
export default function PhotoRoomsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const listing = useLocalListing(id);
  const { t } = useI18n();
  const colors = useColors();
  if (!listing?.scan || listing.deleted) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.textMuted }}>{t('listingForm.notFound')}</Text>
      </View>
    );
  }
  return <PhotoRooms listing={listing} />;
}

function PhotoRooms({ listing }: { listing: LocalListing }) {
  const { t } = useI18n();
  const colors = useColors();
  const router = useRouter();
  const state = useScanModel(listing);

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Text style={[styles.body, { color: colors.textMuted }]}>{t('photoRooms.intro')}</Text>

      {state && state.status !== 'ready' && (
        <ScanModelMessage state={state} scanId={listing.scan!.id} />
      )}

      {listing.photos.length === 0 && (
        <Text style={[styles.body, { color: colors.text }]}>{t('photoRooms.noPhotos')}</Text>
      )}

      {state?.status === 'ready' &&
        listing.photos.map((photo, index) => {
          const choices = [
            { value: NO_ROOM, label: t('photoRooms.none') },
            ...state.model.rooms.map((room) => ({
              value: room.id,
              label: roomDisplayName(t, room),
            })),
          ];
          return (
            <View key={photo.id} style={[styles.card, { backgroundColor: colors.surface }]}>
              <View style={styles.header}>
                <Image
                  source={{ uri: photoUri(listing.id, photo) }}
                  style={[styles.thumb, { backgroundColor: colors.border }]}
                  contentFit="cover"
                  transition={150}
                />
                <Text style={[styles.heading, { color: colors.text }]}>
                  {t('photoRooms.photo', { index: index + 1 })}
                </Text>
              </View>
              <ChoiceChips
                choices={choices}
                value={photo.roomId ?? NO_ROOM}
                allowClear={false}
                onChange={(value) =>
                  editListing(listing.id, (current, now) =>
                    assignPhotoRoom(current, photo.id, value ? value : null, now),
                  )
                }
              />
            </View>
          );
        })}

      <Button title={t('photoRooms.done')} onPress={() => router.back()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: 12, padding: 12, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 96, height: 72, borderRadius: 8 },
  heading: { fontSize: 16, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 22 },
});
