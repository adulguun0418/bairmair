import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useColors } from './theme';

/** Grid spacing in points: a 1 m-like rhythm, with every fifth line stronger. */
const STEP = 18;

/** Every fifth line is a full point wide, the others a hairline. */
function thickness(index: number): number {
  return index % 5 === 0 ? 1 : StyleSheet.hairlineWidth;
}

/**
 * The faint blueprint grid behind floor plans and empty states: the app's "drawing paper".
 * Plain hairline views (no SVG library in the app); fills its parent, ignores touches.
 */
export function BlueprintGrid({ color }: { color?: string }) {
  const colors = useColors();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const line = color ?? colors.grid;
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width !== size.width || height !== size.height) setSize({ width, height });
  };
  const columns = Math.ceil(size.width / STEP);
  const rows = Math.ceil(size.height / STEP);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={onLayout}>
      {Array.from({ length: columns }, (_, index) => (
        <View
          key={`c${index}`}
          style={[
            styles.vertical,
            { left: index * STEP, backgroundColor: line, width: thickness(index) },
          ]}
        />
      ))}
      {Array.from({ length: rows }, (_, index) => (
        <View
          key={`r${index}`}
          style={[
            styles.horizontal,
            { top: index * STEP, backgroundColor: line, height: thickness(index) },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  vertical: { position: 'absolute', top: 0, bottom: 0 },
  horizontal: { position: 'absolute', left: 0, right: 0 },
});
