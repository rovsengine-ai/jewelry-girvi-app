import { View, type ViewProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Radii, Spacing, type Palette } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { loanStatusLabel } from '@/lib/redemption';
import type { LoanStatus } from '@/types/database';

export function statusToken(status: LoanStatus, colors: Palette): string {
  switch (status) {
    case 'active':
      return colors.statusActive;
    case 'redeemed':
      return colors.statusRedeemed;
    case 'closed':
      return colors.statusClosed;
    case 'defaulted':
      return colors.statusDefaulted;
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function Badge({ status, style, ...rest }: ViewProps & { status: LoanStatus }) {
  const colors = useTheme();

  return (
    <View
      accessibilityRole="text"
      style={[
        {
          backgroundColor: statusToken(status, colors),
          borderRadius: Radii.pill,
          paddingHorizontal: Spacing.three,
          paddingVertical: Spacing.one,
          minHeight: MinTouchTarget,
          justifyContent: 'center',
        },
        style,
      ]}
      {...rest}>
      <ThemedText type="smallBold" style={{ color: colors.onStatus }}>
        {loanStatusLabel(status)}
      </ThemedText>
    </View>
  );
}
