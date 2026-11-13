import { useLocalSearchParams, useRouter } from 'expo-router';
import { lazy, Suspense } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { editListing, useLocalListing } from '@/listings/listings';
import { setLocation } from '@/listings/model';
import { useColors } from '@/ui/theme';

/** Loaded on first use, like the other maps (MapLibre's native module). */
const PinPickerMap = lazy(() =>
  import('@/listings/pin-picker-map').then((module) => ({ default: module.PinPickerMap })),
);

/** Pick the listing's exact location on the map (instead of the phone's GPS). */
export default function ListingPinScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const listing = useLocalListing(id);
  const router = useRouter();
  const colors = useColors();
  const initial = listing?.location ?? null;

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <Suspense
        fallback={
          <View style={[styles.fill, styles.center]}>
            <ActivityIndicator />
          </View>
        }
      >
        <PinPickerMap
          initial={initial && { lat: initial.lat, lng: initial.lng }}
          onConfirm={(location) => {
            editListing(id, (current, now) => setLocation(current, location, now));
            router.back();
          }}
        />
      </Suspense>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
});
