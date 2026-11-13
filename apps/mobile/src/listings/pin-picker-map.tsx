import { ULAANBAATAR_CENTER } from '@bairmair/db';
import { Camera, Map, type CameraRef, type LngLat } from '@maplibre/maplibre-react-native';
import { useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMapStyle } from '@/browse/map-style';
import { useI18n } from '@/i18n/i18n';
import { Button } from '@/ui/button';
import { useColors } from '@/ui/theme';
import { locateHere, type LocateResult } from './location';
import { mapPin, type PinnedLocation } from './model';

const nowIso = () => new Date().toISOString();

/** Zoom for a known spot: single buildings are easy to tell apart. */
const BUILDING_ZOOM = 17;
const CITY_ZOOM = 11.5;

type Problem = Extract<LocateResult, { ok: false }> | { ok: false; reason: 'outsideMap' };

/**
 * The listing's exact location, picked on the map: the seller moves the map until the fixed pin
 * in the middle sits on their building, then confirms. Tapping the map centres it there. "My
 * location" only moves the map (the seller still confirms), for sellers at the apartment.
 * Works without location permission, unlike the GPS button in the editor.
 */
export function PinPickerMap({
  initial,
  onConfirm,
}: {
  initial: { lat: number; lng: number } | null;
  onConfirm: (location: PinnedLocation) => void;
}) {
  const { t, locale } = useI18n();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const style = useMapStyle(locale);
  const camera = useRef<CameraRef>(null);
  const start = initial ?? ULAANBAATAR_CENTER;
  const [center, setCenter] = useState<LngLat>([start.lng, start.lat]);
  const [moving, setMoving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);

  if (style.kind !== 'ready') {
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: colors.background }]}>
        {style.kind === 'loading' ? (
          <ActivityIndicator />
        ) : (
          <>
            <Text style={{ color: colors.textMuted }}>{t('map.error')}</Text>
            <Button title={t('browse.retry')} variant="secondary" onPress={style.retry} />
          </>
        )}
      </View>
    );
  }

  const locate = async () => {
    setLocating(true);
    setProblem(null);
    try {
      const result = await locateHere(nowIso);
      if (result.ok) {
        const { lat, lng } = result.location;
        camera.current?.flyTo({ center: [lng, lat], zoom: BUILDING_ZOOM, duration: 800 });
      } else {
        setProblem(result);
      }
    } finally {
      setLocating(false);
    }
  };

  const confirm = () => {
    const pin = mapPin(center[1], center[0], nowIso());
    if (pin) onConfirm(pin);
    else setProblem({ ok: false, reason: 'outsideMap' });
  };

  const needsSettings =
    problem?.reason === 'reduced' || (problem?.reason === 'denied' && !problem.canAskAgain);

  return (
    <View style={styles.fill}>
      <View style={styles.fill}>
        <Map
          style={styles.fill}
          mapStyle={style.style}
          touchRotate={false}
          touchPitch={false}
          compass={false}
          accessibilityLabel={t('listingForm.pinMapLabel')}
          onRegionWillChange={() => setMoving(true)}
          onRegionDidChange={(event) => {
            setCenter(event.nativeEvent.center);
            setMoving(false);
            setProblem(null);
          }}
          onPress={(event) => {
            camera.current?.easeTo({ center: event.nativeEvent.lngLat, duration: 300 });
          }}
        >
          <Camera
            ref={camera}
            initialViewState={{
              center: [start.lng, start.lat],
              zoom: initial ? BUILDING_ZOOM : CITY_ZOOM,
            }}
            minZoom={5}
            maxZoom={19}
          />
        </Map>
        {/* The pin's tip marks the centre of the map. */}
        <View pointerEvents="none" style={styles.pinAnchor}>
          <View style={styles.pinHead} />
          <View style={styles.pinStem} />
        </View>
        <View pointerEvents="none" style={[styles.hint, { backgroundColor: colors.background }]}>
          <Text style={[styles.small, { color: colors.text }]}>{t('listingForm.pinMapHint')}</Text>
        </View>
      </View>
      <View
        style={[
          styles.panel,
          { backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, 16) },
        ]}
      >
        {problem && (
          <Text style={[styles.small, { color: colors.danger }]}>
            {problem.reason === 'outsideMap'
              ? t('listingForm.pinOutside')
              : t(`listingForm.locationErrors.${problem.reason}`)}
          </Text>
        )}
        {needsSettings && (
          <Button
            title={t('listingForm.openSettings')}
            variant="secondary"
            onPress={() => void Linking.openSettings()}
          />
        )}
        <View style={styles.row}>
          <Button
            title={locating ? t('listingForm.locating') : t('listingForm.myLocation')}
            variant="secondary"
            disabled={locating}
            onPress={() => void locate()}
            style={styles.grow}
          />
          <Button
            title={t('listingForm.pinConfirm')}
            disabled={moving}
            onPress={confirm}
            style={styles.grow}
          />
        </View>
      </View>
    </View>
  );
}

const PIN_HEAD = 26;
const PIN_STEM = 14;

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  pinAnchor: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: PIN_HEAD,
    marginLeft: -PIN_HEAD / 2,
    marginTop: -(PIN_HEAD + PIN_STEM),
    alignItems: 'center',
  },
  pinHead: {
    width: PIN_HEAD,
    height: PIN_HEAD,
    borderRadius: PIN_HEAD / 2,
    backgroundColor: '#1c1917',
    borderWidth: 4,
    borderColor: '#ffffff',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 4,
  },
  pinStem: { width: 3, height: PIN_STEM, backgroundColor: '#1c1917', borderRadius: 1.5 },
  hint: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    opacity: 0.94,
  },
  panel: { paddingHorizontal: 16, paddingTop: 12, gap: 10 },
  row: { flexDirection: 'row', gap: 12 },
  grow: { flex: 1 },
  small: { fontSize: 14, lineHeight: 20 },
});
