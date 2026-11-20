import { APPROXIMATE_RADIUS_M, LOCATION_ZOOM, metersCircleRadius } from '@bairmair/browse';
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  type CameraRef,
  type CircleLayerSpecification,
  type MapRef,
} from '@maplibre/maplibre-react-native';
import { useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useI18n } from '@bairmair/native-ui/i18n';
import { Icon } from '@bairmair/native-ui/icon';
import { useScrollLockTouches } from '@/ui/scroll-lock';
import { useColors } from '@bairmair/native-ui/theme';
import { useMapStyle } from './map-style';
import { Text } from '@bairmair/native-ui/text';

/** The website's limits: the city stays in view, and an approximate spot cannot be zoomed into. */
const MIN_ZOOM = 10;
const MAX_ZOOM = { exact: 18, approximate: 16 };

/** Maps stay light in dark mode, so their controls do too. */
const CONTROL_INK = '#1a2b60';

/**
 * A listing's public location: a dot when the owner shows the exact spot, otherwise a shaded
 * circle around the approximate pin. Like the website's: drag to move, pinch or double-tap to
 * zoom, plus +/− buttons; no rotation or tilt. The page scrolls from outside the map (inside a
 * `ScrollLockHost`, which Android needs so vertical drags reach the map).
 */
export function LocationMap({ lat, lng, exact }: { lat: number; lng: number; exact: boolean }) {
  const { t, locale } = useI18n();
  const colors = useColors();
  const style = useMapStyle(locale);
  const mapRef = useRef<MapRef>(null);
  const cameraRef = useRef<CameraRef>(null);
  const maxZoom = exact ? MAX_ZOOM.exact : MAX_ZOOM.approximate;
  const touches = useScrollLockTouches();

  if (style.kind !== 'ready') {
    return (
      <View style={[styles.frame, styles.center, { backgroundColor: colors.surface }]}>
        {style.kind === 'loading' ? (
          <ActivityIndicator />
        ) : (
          <Text style={{ color: colors.textMuted }}>{t('map.error')}</Text>
        )}
      </View>
    );
  }

  const zoomBy = (step: number) => {
    mapRef.current
      ?.getZoom()
      .then((zoom) => {
        const next = Math.min(maxZoom, Math.max(MIN_ZOOM, Math.round(zoom) + step));
        cameraRef.current?.zoomTo(next, { duration: 250 });
      })
      .catch(() => undefined);
  };

  const point: GeoJSON.Feature = {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lng, lat] },
    properties: {},
  };
  const paint: CircleLayerSpecification['paint'] = exact
    ? {
        'circle-radius': 8,
        'circle-color': '#1a2b60',
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 3,
      }
    : {
        'circle-radius': metersCircleRadius(APPROXIMATE_RADIUS_M, lat) as never,
        'circle-color': '#199ed6',
        'circle-opacity': 0.25,
        'circle-stroke-color': '#1a2b60',
        'circle-stroke-width': 2,
      };

  return (
    <View style={styles.frame} accessibilityLabel={t('listingPage.mapLabel')} {...touches}>
      <Map
        ref={mapRef}
        style={styles.fill}
        mapStyle={style.style}
        touchRotate={false}
        touchPitch={false}
        compass={false}
      >
        <Camera
          ref={cameraRef}
          initialViewState={{
            center: [lng, lat],
            zoom: exact ? LOCATION_ZOOM.exact : LOCATION_ZOOM.approximate,
          }}
          minZoom={MIN_ZOOM}
          maxZoom={maxZoom}
        />
        <GeoJSONSource id="location" data={point}>
          <Layer id="location" type="circle" paint={paint} />
        </GeoJSONSource>
      </Map>
      <View style={styles.zoom}>
        <View style={styles.zoomClip}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('map.zoomIn')}
            onPress={() => zoomBy(1)}
            style={({ pressed }) => [styles.zoomButton, pressed && styles.pressed]}
          >
            <Icon name="plus" size={18} color={CONTROL_INK} weight="semibold" />
          </Pressable>
          <View style={styles.zoomDivider} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('map.zoomOut')}
            onPress={() => zoomBy(-1)}
            style={({ pressed }) => [styles.zoomButton, pressed && styles.pressed]}
          >
            <Icon name="minus" size={18} color={CONTROL_INK} weight="semibold" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const ZOOM_BUTTON = 36;

const styles = StyleSheet.create({
  frame: { height: 220, borderRadius: 12, overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center' },
  fill: { flex: 1 },
  zoom: {
    position: 'absolute',
    top: 8,
    right: 8,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  /** Separate from the shadow: iOS clips a shadow on a view that clips its children. */
  zoomClip: { borderRadius: 10, overflow: 'hidden' },
  zoomButton: {
    width: ZOOM_BUTTON,
    height: ZOOM_BUTTON,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomDivider: { height: StyleSheet.hairlineWidth, backgroundColor: '#d6d3d1' },
  pressed: { backgroundColor: '#eef1f7' },
});
