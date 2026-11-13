import { APPROXIMATE_RADIUS_M, LOCATION_ZOOM, metersCircleRadius } from '@bairmair/browse';
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  type CircleLayerSpecification,
} from '@maplibre/maplibre-react-native';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '@/i18n/i18n';
import { useColors } from '@/ui/theme';
import { useMapStyle } from './map-style';

/**
 * A listing's public location: a dot when the owner shows the exact spot, otherwise a shaded
 * circle around the approximate pin. Fixed (no panning), so the page scrolls past it.
 */
export function LocationMap({ lat, lng, exact }: { lat: number; lng: number; exact: boolean }) {
  const { t, locale } = useI18n();
  const colors = useColors();
  const style = useMapStyle(locale);

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

  const point: GeoJSON.Feature = {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lng, lat] },
    properties: {},
  };
  const paint: CircleLayerSpecification['paint'] = exact
    ? {
        'circle-radius': 8,
        'circle-color': '#1c1917',
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 3,
      }
    : {
        'circle-radius': metersCircleRadius(APPROXIMATE_RADIUS_M, lat) as never,
        'circle-color': '#f59e0b',
        'circle-opacity': 0.25,
        'circle-stroke-color': '#b45309',
        'circle-stroke-width': 2,
      };

  return (
    <View style={styles.frame} accessibilityLabel={t('listingPage.mapLabel')}>
      <Map
        style={styles.fill}
        mapStyle={style.style}
        dragPan={false}
        touchZoom={false}
        doubleTapZoom={false}
        doubleTapHoldZoom={false}
        touchRotate={false}
        touchPitch={false}
        compass={false}
      >
        <Camera
          initialViewState={{
            center: [lng, lat],
            zoom: exact ? LOCATION_ZOOM.exact : LOCATION_ZOOM.approximate,
          }}
        />
        <GeoJSONSource id="location" data={point}>
          <Layer id="location" type="circle" paint={paint} />
        </GeoJSONSource>
      </Map>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { height: 220, borderRadius: 12, overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center' },
  fill: { flex: 1 },
});
