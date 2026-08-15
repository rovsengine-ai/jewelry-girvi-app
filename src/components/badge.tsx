import { View, type ViewProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Radii, Spacing, type Palette } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { loanStatusLabel } from '@/lib/redemption';
import { useLanguage } from '@/providers/language-provider';
import type { LoanStatus } from '@/types/database';

export function statusToken(status: LoanStatus, colors: Palette): string {
  switch (status) {
    case 'active':
      return colors.tintSuccess;
    case 'redeemed':
      return colors.tintRedeemed;
    case 'closed':
      return colors.tintClosed;
    case 'defaulted':
      return colors.tintDanger;
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function statusOnToken(status: LoanStatus, colors: Palette): string {
  switch (status) {
    case 'active':
      return colors.onTintSuccess;
    case 'redeemed':
      return colors.onTintRedeemed;
    case 'closed':
      return colors.onTintClosed;
    case 'defaulted':
      return colors.onTintDanger;
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function Badge({
  status,
  style,
  showDot = true,
  ...rest
}: ViewProps & { status: LoanStatus; showDot?: boolean }) {
  const colors = useTheme();
  const { language } = useLanguage();
  const backgroundColor = statusToken(status, colors);
  const foreground = statusOnToken(status, colors);

  return (
    <View
      accessibilityRole="text"
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor,
          borderRadius: Radii.pill,
          paddingHorizontal: Spacing.two + Spacing.one,
          paddingVertical: Spacing.one,
          minHeight: MinTouchTarget,
          justifyContent: 'center',
          gap: Spacing.one,
        },
        style,
      ]}
      {...rest}>
      {showDot ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            width: Spacing.one,
            height: Spacing.one,
            borderRadius: Radii.pill,
            backgroundColor: foreground,
          }}
        />
      ) : null}
      <ThemedText type="caption" style={{ color: foreground }}>
        {loanStatusLabel(status, language)}
      </ThemedText>
    </View>
  );
}
