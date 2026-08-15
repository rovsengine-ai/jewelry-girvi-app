import { StyleSheet } from 'react-native';

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
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={[
        styles.fab,
        {
          backgroundColor: colors.primary,
          bottom,
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
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: Spacing.four,
    width: Sizes.fab,
    height: Sizes.fab,
    minWidth: MinTouchTarget,
    minHeight: MinTouchTarget,
    borderRadius: Radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
