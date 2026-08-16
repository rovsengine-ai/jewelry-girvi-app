import { View, type ViewProps } from 'react-native';

import { Elevation, Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function Card({ style, ...rest }: ViewProps) {
  const colors = useTheme();

  return (
    <View
      style={[
        {
          backgroundColor: colors.elevated,
          borderRadius: Radii.md,
          padding: Spacing.three,
          gap: Spacing.two,
          shadowColor: colors.shadow,
        },
        Elevation.card,
        style,
      ]}
      {...rest}
    />
  );
}
