/**
 * Filter pills. Selected/unselected fills sit on an inner View so
 * PressableScale / Reanimated cannot drop backgroundColor (chips were
 * rendering as bare labels on Owner loans).
 *
 * https://docs.expo.dev/versions/v57.0.0/sdk/haptics/
 */
import { type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function FilterChip({
  label,
  selected,
  onPress,
  testID,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const colors = useTheme();

  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.pressable}>
      <View
        testID={testID ? `${testID}-surface` : undefined}
        style={[
          styles.chip,
          {
            backgroundColor: selected ? colors.gold : colors.elevated,
            borderColor: colors.border,
          },
          !selected && styles.chipOutline,
        ]}>
        <ThemedText type="label" style={{ color: selected ? colors.onGold : colors.text }}>
          {label}
        </ThemedText>
      </View>
    </PressableScale>
  );
}

export function FilterChipRow({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}>
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.four,
  },
  pressable: {
    minHeight: MinTouchTarget,
    minWidth: MinTouchTarget,
  },
  chip: {
    minHeight: MinTouchTarget,
    borderRadius: Radii.pill,
    paddingHorizontal: Spacing.three,
    justifyContent: 'center',
  },
  chipOutline: {
    borderWidth: 1,
  },
});
