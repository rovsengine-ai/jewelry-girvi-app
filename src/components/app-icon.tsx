/**
 * SF Symbols on iOS, Material Symbols on Android/web.
 * https://docs.expo.dev/versions/v57.0.0/sdk/symbols/
 */
import { SymbolView, type AndroidSymbol } from 'expo-symbols';
import { View, type ColorValue, type ViewProps } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';

import { Radii, Sizes, Spacing } from '@/constants/theme';
import { TabBarSymbol } from '@/components/tab-bar-symbol';

export function AppIcon({
  ios,
  android,
  color,
  size = Sizes.leadingIcon,
  accessibilityLabel,
}: {
  ios: SFSymbol;
  android: AndroidSymbol;
  color: ColorValue;
  size?: number;
  accessibilityLabel?: string;
}) {
  if (accessibilityLabel) {
    return (
      <View accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
        <TabBarSymbol ios={ios} android={android} color={color} size={size} />
      </View>
    );
  }

  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <SymbolView name={{ ios, android, web: android }} tintColor={color} size={size} />
    </View>
  );
}

export function TintedIconWell({
  tint,
  children,
  style,
  ...rest
}: ViewProps & { tint: string }) {
  return (
    <View
      style={[
        {
          width: Sizes.avatar,
          height: Sizes.avatar,
          borderRadius: Radii.sm,
          backgroundColor: tint,
          alignItems: 'center',
          justifyContent: 'center',
          padding: Spacing.one,
        },
        style,
      ]}
      {...rest}>
      {children}
    </View>
  );
}
