import { isInMongolia } from '@bairmair/db';
import * as Location from 'expo-location';
import type { PinnedLocation } from './model';

export type LocateResult =
  | { ok: true; location: PinnedLocation }
  | {
      ok: false;
      /**
       * - `denied`: no location permission (`canAskAgain: false` → only Settings can change it)
       * - `reduced`: "Precise Location" is off, so the position is kilometres off
       * - `outside`: the position is outside Mongolia (the database rejects it)
       * - `unavailable`: no fix (location services off, indoors without signal…)
       */
      reason: 'denied' | 'reduced' | 'outside' | 'unavailable';
      canAskAgain?: boolean;
    };

/** The phone's current position, for a seller standing at (or in) the building. */
export async function locateHere(now: () => string): Promise<LocateResult> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) {
    return { ok: false, reason: 'denied', canAskAgain: permission.canAskAgain };
  }
  if (permission.ios?.accuracy === 'reduced') return { ok: false, reason: 'reduced' };

  let position: Location.LocationObject;
  try {
    position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Highest,
    });
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
  const { latitude, longitude, accuracy } = position.coords;
  if (!isInMongolia(latitude, longitude)) return { ok: false, reason: 'outside' };
  return {
    ok: true,
    location: {
      lat: latitude,
      lng: longitude,
      accuracyM: accuracy === null ? null : Math.round(accuracy),
      capturedAt: now(),
    },
  };
}
