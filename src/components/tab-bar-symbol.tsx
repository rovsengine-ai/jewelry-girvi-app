/**
 * Tab icons: SF Symbols on iOS, Material Symbols on Android/web.
 * https://docs.expo.dev/versions/v57.0.0/sdk/symbols/
 */
import { SymbolView, type AndroidSymbol } from 'expo-symbols';
import type { ColorValue } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';

export function TabBarSymbol({
  ios,
  android,
  color,
  size,
}: {
  ios: SFSymbol;
  android: AndroidSymbol;
  color: ColorValue;
  size: number;
}) {
  return (
    <SymbolView name={{ ios, android, web: android }} tintColor={color} size={size} />
  );
}
