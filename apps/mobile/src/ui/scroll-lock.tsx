import { createContext, useContext, useState, type ReactNode } from 'react';
import { Platform, type GestureResponderEvent, type ViewProps } from 'react-native';

const ScrollLockContext = createContext<((locked: boolean) => void) | null>(null);

/**
 * Holds a scroll view's `scrollEnabled` so a map inside it can switch scrolling off while a
 * finger is on the map. Android's ScrollView takes vertical drags from native children (the map
 * never gets them); iOS hands them to the map by itself.
 *
 * A render prop, so only the scroll view re-renders when the lock changes: the content elements
 * were made by the screen and are passed through unchanged.
 */
export function ScrollLockHost({ children }: { children: (scrollEnabled: boolean) => ReactNode }) {
  const [locked, setLocked] = useState(false);
  return (
    <ScrollLockContext.Provider value={setLocked}>{children(!locked)}</ScrollLockContext.Provider>
  );
}

/**
 * Touch handlers for a view whose native content needs every drag (a map): the surrounding
 * `ScrollLockHost` stops scrolling from the first finger down until the last one lifts. Only on
 * Android; elsewhere, and outside a host, they do nothing.
 */
export function useScrollLockTouches(): Pick<
  ViewProps,
  'onTouchStart' | 'onTouchEnd' | 'onTouchCancel'
> {
  const setLocked = useContext(ScrollLockContext);
  if (!setLocked || Platform.OS !== 'android') return {};
  const release = (event: GestureResponderEvent) => {
    if (event.nativeEvent.touches.length === 0) setLocked(false);
  };
  return {
    onTouchStart: () => setLocked(true),
    onTouchEnd: release,
    onTouchCancel: () => setLocked(false),
  };
}
