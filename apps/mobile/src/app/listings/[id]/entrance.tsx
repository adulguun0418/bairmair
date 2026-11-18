import {
  doorNear,
  findEntrance,
  floorPlanViewBox,
  type RoomModelV1,
  type Vec2,
} from '@bairmair/room-model';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useI18n } from '@/i18n/i18n';
import { editListing, useLocalListing } from '@/listings/listings';
import { setEntranceDoor, type LocalListing } from '@/listings/model';
import { useScanModel } from '@/listings/scan-model';
import { ScanModelMessage } from '@/listings/scan-model-message';
import { Button } from '@/ui/button';
import { ScanFloorPlan } from '@/ui/scan-floor-plan';
import { Text } from '@/ui/text';
import { useColors } from '@/ui/theme';

/**
 * Marking the apartment's front door: the seller taps it on the floor plan. The plan shows the
 * current one (navy, with an arrow), whether marked or guessed from the scan. Synced with the
 * room labels; the 3D model then opens looking in through this door.
 */
export default function EntranceScreen() {
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
  return <EntrancePicker listing={listing} />;
}

function EntrancePicker({ listing }: { listing: LocalListing }) {
  const { t } = useI18n();
  const colors = useColors();
  const router = useRouter();
  const state = useScanModel(listing);
  const scan = listing.scan!;
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const model = state?.status === 'ready' ? state.model : null;
  const entrance = model ? findEntrance(model) : null;

  // The plan SVG fits its view box into the frame, centered (`xMidYMid meet`).
  const toPlan = (point: Vec2, current: RoomModelV1, frame: { width: number; height: number }) => {
    const box = floorPlanViewBox(current);
    const scale = Math.min(frame.width / box.width, frame.height / box.height);
    const offsetX = (frame.width - box.width * scale) / 2;
    const offsetY = (frame.height - box.height * scale) / 2;
    return [
      box.minX + (point[0] - offsetX) / scale,
      box.minZ + (point[1] - offsetY) / scale,
    ] as Vec2;
  };

  const pick = (point: Vec2) => {
    if (!model || !size) return;
    const door = doorNear(model, toPlan(point, model, size));
    if (!door) {
      setMessage({ text: t('entrance.noDoor'), ok: false });
      return;
    }
    editListing(listing.id, (current, now) => setEntranceDoor(current, door.id, now));
    setMessage({ text: t('entrance.saved'), ok: true });
  };

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize((current) =>
      current && current.width === width && current.height === height ? current : { width, height },
    );
  };

  const status =
    entrance?.source === 'seller'
      ? t('entrance.chosen')
      : entrance
        ? t('entrance.guessed')
        : t('entrance.none');

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Text style={[styles.body, { color: colors.textMuted }]}>{t('entrance.intro')}</Text>

      {state && state.status !== 'ready' && <ScanModelMessage state={state} scanId={scan.id} />}

      {model && (
        <View style={styles.planArea} onLayout={onLayout}>
          {size && (
            <>
              <ScanFloorPlan model={model} height={size.height} />
              <Pressable
                style={StyleSheet.absoluteFill}
                accessibilityRole="button"
                accessibilityLabel={t('entrance.intro')}
                onPress={(event) =>
                  pick([event.nativeEvent.locationX, event.nativeEvent.locationY])
                }
              />
            </>
          )}
        </View>
      )}

      <View style={styles.footer}>
        <Text
          style={[
            styles.small,
            { color: message?.ok === false ? colors.warning : colors.textMuted },
          ]}
        >
          {message?.text ?? status}
        </Text>
        {scan.entranceDoorId !== null && (
          <Button
            title={t('entrance.auto')}
            variant="secondary"
            size="small"
            onPress={() => {
              editListing(listing.id, (current, now) => setEntranceDoor(current, null, now));
              setMessage(null);
            }}
          />
        )}
        <Button title={t('entrance.done')} onPress={() => router.back()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 16, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  planArea: { flex: 1, minHeight: 240 },
  footer: { gap: 10, paddingBottom: 24 },
  body: { fontSize: 16, lineHeight: 22 },
  small: { fontSize: 14, lineHeight: 20 },
});
