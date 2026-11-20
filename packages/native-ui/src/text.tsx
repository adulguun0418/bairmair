import { createContext, useContext } from 'react';
import {
  StyleSheet,
  Text as NativeText,
  TextInput as NativeTextInput,
  type TextInputProps,
  type TextProps,
  type TextStyle,
} from 'react-native';
import { fontFamilyFor } from './theme';

/** Set inside a Text, so nested text without its own weight inherits the parent's face. */
const InsideText = createContext(false);

/**
 * A custom font has one file per weight, and Android ignores `fontWeight` for it. This picks the
 * Onest file from the style's weight and drops the weight itself (iOS would otherwise look for a
 * bold face of that file). A style with its own `fontFamily` is left alone.
 */
function withFamily(style: TextProps['style'], nested: boolean): TextProps['style'] {
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  if (flat.fontFamily) return style;
  if (nested && flat.fontWeight === undefined) return style;
  return { ...flat, fontFamily: fontFamilyFor(flat.fontWeight), fontWeight: undefined };
}

/** React Native's Text in the app's typeface. Use this instead of `react-native`'s. */
export function Text({ style, ...props }: TextProps) {
  const nested = useContext(InsideText);
  const text = <NativeText {...props} style={withFamily(style, nested)} />;
  return nested ? text : <InsideText.Provider value>{text}</InsideText.Provider>;
}

/** React Native's TextInput in the app's typeface. */
export function TextInput({ style, ...props }: TextInputProps) {
  return <NativeTextInput {...props} style={withFamily(style, false)} />;
}
