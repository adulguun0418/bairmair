import { isInMongolia } from '@bairmair/db';
import * as Location from 'expo-location';
import { useEffect, useRef, type RefObject } from 'react';
import { betterFix, type PinnedLocation } from './model';

/**
 * Watches the phone's position while the screen is open and keeps the most accurate fix inside
 * Mongolia ("scanned on-site"). Asks for permission if needed; without it (or with "Precise
 * Location" off) the ref stays null and the scan simply has no location.
 */
export function useBestFix(): RefObject<PinnedLocation | null> {
  const best = useRef<PinnedLocation | null>(null);
  useEffect(() => {
    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;
    void (async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (cancelled || !permission.granted || permission.ios?.accuracy === 'reduced') return;
      const watch = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Highest, timeInterval: 2_000, distanceInterval: 0 },
        ({ coords }) => {
          if (!isInMongolia(coords.latitude, coords.longitude)) return;
          best.current = betterFix(best.current, {
            lat: coords.latitude,
            lng: coords.longitude,
            accuracyM: coords.accuracy === null ? null : Math.round(coords.accuracy),
            capturedAt: new Date().toISOString(),
          });
        },
      );
      if (cancelled) watch.remove();
      else subscription = watch;
    })().catch((error: unknown) => console.warn('Location watch failed', error));
    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, []);
  return best;
}

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
