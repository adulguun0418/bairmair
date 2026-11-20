import { formatArea } from '@bairmair/i18n';
import {
  applyRoomDividers,
  dividerFromPlan,
  floorPlanViewBox,
  ROOM_DIVIDER_LIMITS,
  type RoomModelV1,
  type Vec2,
} from '@bairmair/room-model';
import { randomUUID } from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useLayoutEffect, useRef, useState } from 'react';
import { Alert, PanResponder, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useI18n } from '@bairmair/native-ui/i18n';
import { editListing, useLocalListing } from '@/listings/listings';
import { addRoomDivider, removeRoomDividers, type LocalListing } from '@/listings/model';
import { useScanModel } from '@/listings/scan-model';
import { ScanModelMessage } from '@/listings/scan-model-message';
import { Button } from '@bairmair/native-ui/button';
import { ScanFloorPlan } from '@bairmair/native-ui/scan-floor-plan';
import { Text } from '@bairmair/native-ui/text';
import { useColors } from '@bairmair/native-ui/theme';

/**
 * Dividing rooms the walls did not separate (an open kitchen, a doorway RoomPlan missed): the
 * seller draws a line across the floor plan from wall to wall. Each line is checked against the
 * model first; one that does not split a room is not saved and the reason is shown. Lines are
 * stored in the scan's own coordinates (`dividerFromPlan`) and synced like room labels.
 */
export default function RoomDivideScreen() {
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
  return <RoomDivide listing={listing} />;
}

/** A finger stroke in plan-view pixels. */
interface Stroke {
  start: Vec2;
  end: Vec2;
}

/** Strokes shorter than this (in points) are taps. */
const MIN_STROKE_PT = 24;

/** Short and unique within the scan (`DIVIDER_ID_PATTERN`). */
const newDividerId = () => randomUUID().replace(/-/g, '').slice(0, 8);

function RoomDivide({ listing }: { listing: LocalListing }) {
  const { t, locale } = useI18n();
  const colors = useColors();
  const router = useRouter();
  const state = useScanModel(listing);
  const scan = listing.scan!;
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [stroke, setStroke] = useState<Stroke | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const model = state?.status === 'ready' ? state.model : null;

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

  const finish = (done: Stroke) => {
    setStroke(null);
    if (!model || !size) return;
    if (Math.hypot(done.end[0] - done.start[0], done.end[1] - done.start[1]) < MIN_STROKE_PT) {
      return;
    }
    if (scan.roomDividers.length >= ROOM_DIVIDER_LIMITS.count) {
      setMessage({ text: t('roomDivide.limit', { count: ROOM_DIVIDER_LIMITS.count }), ok: false });
      return;
    }
    const divider = dividerFromPlan(
      model,
      newDividerId(),
      toPlan(done.start, model, size),
      toPlan(done.end, model, size),
    );
    const [result] = applyRoomDividers(model, [divider]).results;
    if (result?.status !== 'applied') {
      setMessage({ text: t(`roomDivide.${result?.status ?? 'noCut'}`), ok: false });
      return;
    }
    editListing(listing.id, (current, now) => addRoomDivider(current, divider, now));
    setMessage({ text: t('roomDivide.applied'), ok: true });
  };

  // The responder is created once; it reaches the current render through this ref.
  const finishRef = useRef(finish);
  useLayoutEffect(() => {
    finishRef.current = finish;
  });
  const strokeRef = useRef<Stroke | null>(null);
  // The handlers only run on touches, never during render; the rule cannot see that.
  // eslint-disable-next-line react-hooks/refs
  const [responder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Keep the stroke even if a parent would like to scroll or go back.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (event) => {
        const start: Vec2 = [event.nativeEvent.locationX, event.nativeEvent.locationY];
        strokeRef.current = { start, end: start };
        setStroke(strokeRef.current);
      },
      onPanResponderMove: (_event, gesture) => {
        const current = strokeRef.current;
        if (!current) return;
        strokeRef.current = {
          start: current.start,
          end: [current.start[0] + gesture.dx, current.start[1] + gesture.dy],
        };
        setStroke(strokeRef.current);
      },
      onPanResponderRelease: () => {
        const done = strokeRef.current;
        strokeRef.current = null;
        if (done) finishRef.current(done);
      },
      onPanResponderTerminate: () => {
        strokeRef.current = null;
        setStroke(null);
      },
    }),
  );

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize((current) =>
      current && current.width === width && current.height === height ? current : { width, height },
    );
  };

  const undo = () => {
    const last = scan.roomDividers.at(-1);
    if (!last) return;
    editListing(listing.id, (current, now) => removeRoomDividers(current, [last.id], now));
    setMessage(null);
  };
  const clear = () =>
    Alert.alert(t('roomDivide.clearTitle'), t('roomDivide.clearBody'), [
      { text: t('roomDivide.cancel'), style: 'cancel' },
      {
        text: t('roomDivide.clear'),
        style: 'destructive',
        onPress: () => {
          editListing(listing.id, (current, now) =>
            removeRoomDividers(
              current,
              (current.scan?.roomDividers ?? []).map((divider) => divider.id),
              now,
            ),
          );
          setMessage(null);
        },
      },
    ]);

  const line = stroke ? strokeStyle(stroke) : null;
  const total = state?.status === 'ready' ? state.metrics.totalAreaM2 : null;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Text style={[styles.body, { color: colors.textMuted }]}>{t('roomDivide.intro')}</Text>

      {state && state.status !== 'ready' && <ScanModelMessage state={state} scanId={scan.id} />}

      {model && (
        <View style={styles.planArea} onLayout={onLayout}>
          {size && (
            <>
              <ScanFloorPlan model={model} height={size.height} />
              <View style={StyleSheet.absoluteFill} {...responder.panHandlers}>
                {line && <View style={[styles.stroke, { backgroundColor: colors.brand }, line]} />}
              </View>
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
          {message?.text ??
            [
              t('roomDivide.lines', { count: scan.roomDividers.length }),
              total === null ? null : formatArea(total, locale),
            ]
              .filter(Boolean)
              .join(' · ')}
        </Text>
        <View style={styles.row}>
          <Button
            title={t('roomDivide.undo')}
            icon="undo"
            variant="secondary"
            size="small"
            disabled={scan.roomDividers.length === 0}
            onPress={undo}
            style={styles.grow}
          />
          <Button
            title={t('roomDivide.clear')}
            variant="secondary"
            size="small"
            disabled={scan.roomDividers.length === 0}
            onPress={clear}
            style={styles.grow}
          />
        </View>
        <Button title={t('roomDivide.done')} onPress={() => router.back()} />
      </View>
    </View>
  );
}

/** A thin bar from the stroke's start to its end. */
function strokeStyle({ start, end }: Stroke) {
  const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
  const angle = Math.atan2(end[1] - start[1], end[0] - start[0]);
  return {
    left: (start[0] + end[0]) / 2 - length / 2,
    top: (start[1] + end[1]) / 2 - STROKE_WIDTH / 2,
    width: length,
    transform: [{ rotate: `${angle}rad` }],
  };
}

const STROKE_WIDTH = 4;

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 16, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  planArea: { flex: 1, minHeight: 240 },
  stroke: { position: 'absolute', height: STROKE_WIDTH, borderRadius: STROKE_WIDTH / 2 },
  footer: { gap: 10, paddingBottom: 24 },
  row: { flexDirection: 'row', gap: 10 },
  grow: { flex: 1 },
  body: { fontSize: 16, lineHeight: 22 },
  small: { fontSize: 14, lineHeight: 20 },
});
