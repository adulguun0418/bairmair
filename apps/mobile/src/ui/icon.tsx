import { SymbolView, type AndroidSymbol, type SFSymbol, type SymbolWeight } from 'expo-symbols';
import { Platform, type ColorValue, type StyleProp, type ViewStyle } from 'react-native';

/**
 * The app's icons: an SF Symbol on iOS and the matching Material Symbol on Android (drawn by
 * expo-symbols from a font in the JS bundle, so no native change is needed).
 */
const ICONS = {
  search: { ios: 'magnifyingglass', android: 'search' },
  filter: { ios: 'line.3.horizontal.decrease', android: 'tune' },
  map: { ios: 'map', android: 'map' },
  list: { ios: 'list.bullet', android: 'list' },
  cube: { ios: 'cube', android: 'deployed_code' },
  view3d: { ios: 'rotate.3d', android: 'view_in_ar' },
  plan: { ios: 'square.split.bottomrightquarter', android: 'grid_view' },
  photos: { ios: 'photo.on.rectangle', android: 'photo_library' },
  ruler: { ios: 'ruler', android: 'straighten' },
  area: { ios: 'square.dashed', android: 'square_foot' },
  rooms: { ios: 'door.left.hand.open', android: 'door_front' },
  floor: { ios: 'stairs', android: 'stairs' },
  building: { ios: 'building.2', android: 'apartment' },
  calendar: { ios: 'calendar', android: 'calendar_month' },
  pin: { ios: 'mappin.and.ellipse', android: 'location_on' },
  phone: { ios: 'phone.fill', android: 'call' },
  message: { ios: 'message.fill', android: 'sms' },
  share: { ios: 'square.and.arrow.up', android: 'share' },
  verified: { ios: 'checkmark.seal.fill', android: 'verified' },
  check: { ios: 'checkmark.circle.fill', android: 'check_circle' },
  chevron: { ios: 'chevron.right', android: 'chevron_right' },
  arrow: { ios: 'arrow.right', android: 'arrow_forward' },
  flag: { ios: 'flag', android: 'flag' },
  person: { ios: 'person.fill', android: 'person' },
} as const satisfies Record<string, { ios: SFSymbol; android: AndroidSymbol }>;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  size = 18,
  color,
  weight = 'medium',
  style,
}: {
  name: IconName;
  size?: number;
  color: ColorValue;
  /** iOS only; Material Symbols use their regular weight. */
  weight?: SymbolWeight;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <SymbolView
      name={ICONS[name]}
      size={size}
      tintColor={color}
      weight={Platform.OS === 'ios' ? weight : undefined}
      style={style}
    />
  );
}
