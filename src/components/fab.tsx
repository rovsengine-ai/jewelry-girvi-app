/**
 * Circular scan FAB. Layout (absolute bottom-right) and primary fill live on
 * plain Views — never on PressableScale — so Reanimated cannot drop them
 * (same failure mode as Button primary fill).
 *
 * https://docs.expo.dev/versions/v57.0.0/sdk/symbols/
 * https://docs.expo.dev/versions/v57.0.0/sdk/haptics/
 */
import { StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { PressableScale } from '@/components/pressable-scale';
import { Elevation, MinTouchTarget, Radii, Sizes, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function Fab({
  onPress,
  accessibilityLabel,
  testID,
  bottom,
}: {
  onPress: () => void;
  accessibilityLabel: string;
  testID?: string;
  bottom: number;
}) {
  const colors = useTheme();

  return (
    <View
      pointerEvents="box-none"
      testID={testID ? `${testID}-anchor` : undefined}
      style={[styles.anchor, { bottom }]}>
      <PressableScale
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={styles.pressable}>
        <View
          testID={testID ? `${testID}-surface` : undefined}
          style={[
            styles.fab,
            {
              backgroundColor: colors.primary,
              shadowColor: colors.shadow,
            },
            Elevation.fab,
          ]}>
          <AppIcon
            ios="camera.fill"
            android="photo_camera"
            color={colors.onPrimary}
            size={Spacing.four}
          />
        </View>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    right: Spacing.four,
    zIndex: 20,
  },
  pressable: {
    width: Sizes.fab,
    height: Sizes.fab,
    minWidth: MinTouchTarget,
    minHeight: MinTouchTarget,
  },
  fab: {
    width: Sizes.fab,
    height: Sizes.fab,
    minWidth: MinTouchTarget,
    minHeight: MinTouchTarget,
    borderRadius: Radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
