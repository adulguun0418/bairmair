import { LISTING_LIMITS } from '@bairmair/db';
import { formatArea, roomDisplayName } from '@bairmair/i18n';
import { ROOM_LABELS } from '@bairmair/room-model';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useI18n } from '@/i18n/i18n';
import { editListing, useLocalListing } from '@/listings/listings';
import { setRoomLabel, type LocalListing } from '@/listings/model';
import { useScanModel } from '@/listings/scan-model';
import { ScanModelMessage } from '@/listings/scan-model-message';
import { Button } from '@/ui/button';
import { ChoiceChips } from '@/ui/choice-chips';
import { ScanFloorPlan } from '@/ui/scan-floor-plan';
import { TextField } from '@/ui/text-field';
import { useColors } from '@/ui/theme';
import { Text } from '@/ui/text';

/**
 * Room review after a scan: the floor plan, and per room its type (RoomPlan's guess, which the
 * seller confirms or corrects) and an optional name. Opened from the scan with `flow=1`, it
 * continues to the photo step.
 */
export default function RoomReviewScreen() {
  const { id, flow } = useLocalSearchParams<{ id: string; flow?: string }>();
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
  return <RoomReview listing={listing} inFlow={flow === '1'} />;
}

function RoomReview({ listing, inFlow }: { listing: LocalListing; inFlow: boolean }) {
  const { t, locale } = useI18n();
  const colors = useColors();
  const router = useRouter();
  const state = useScanModel(listing);
  const scan = listing.scan!;

  const labelChoices = ROOM_LABELS.map((label) => ({ value: label, label: t(`rooms.${label}`) }));
  const next = () => {
    if (inFlow && listing.photos.length > 0) {
      router.replace({ pathname: '/listings/[id]/photo-rooms', params: { id: listing.id } });
    } else {
      router.back();
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
    >
      <Text style={[styles.body, { color: colors.textMuted }]}>{t('roomReview.intro')}</Text>

      {state && state.status !== 'ready' && <ScanModelMessage state={state} scanId={scan.id} />}

      {state?.status === 'ready' && (
        <>
          <ScanFloorPlan model={state.model} />
          {state.model.rooms.map((room, index) => {
            const area = state.metrics.rooms.find((entry) => entry.id === room.id)?.areaM2 ?? 0;
            const incomplete = state.incompleteRoomIds.includes(room.id);
            return (
              <View key={room.id} style={[styles.card, { backgroundColor: colors.surface }]}>
                <View style={styles.line}>
                  <Text style={[styles.heading, { color: colors.text }]}>
                    {roomDisplayName(t, room)}
                  </Text>
                  <Text style={[styles.body, { color: colors.textMuted }]}>
                    {formatArea(area, locale)}
                  </Text>
                </View>
                <Text style={[styles.small, { color: colors.textMuted }]}>
                  {t('roomReview.room', { index: index + 1 })} · {t('viewer.approximateScanned')}
                </Text>
                {incomplete && (
                  <Text style={[styles.small, { color: colors.warning }]}>
                    {t('roomReview.incomplete')}
                  </Text>
                )}
                <ChoiceChips
                  label={t('roomReview.label')}
                  choices={labelChoices}
                  value={room.label}
                  allowClear={false}
                  onChange={(label) => {
                    if (label) {
                      editListing(listing.id, (current, now) =>
                        setRoomLabel(current, room.id, { label }, now),
                      );
                    }
                  }}
                />
                <TextField
                  label={t('roomReview.name')}
                  placeholder={t('roomReview.namePlaceholder')}
                  value={scan.roomLabels[room.id]?.name ?? ''}
                  maxLength={LISTING_LIMITS.roomName.max}
                  onChangeText={(name) =>
                    editListing(listing.id, (current, now) =>
                      setRoomLabel(current, room.id, { name }, now),
                    )
                  }
                />
              </View>
            );
          })}
        </>
      )}

      <Button
        title={inFlow && listing.photos.length > 0 ? t('roomReview.next') : t('roomReview.done')}
        onPress={next}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: 12, padding: 14, gap: 10 },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  heading: { fontSize: 17, fontWeight: '600', flexShrink: 1 },
  body: { fontSize: 16, lineHeight: 22 },
  small: { fontSize: 14, lineHeight: 20 },
});
