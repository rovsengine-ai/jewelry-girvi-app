import { ActivityIndicator, StyleSheet, View, type PressableProps } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useLanguage } from '@/providers/language-provider';
import { useNetworkOptional } from '@/providers/network-provider';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';

export type ButtonProps = Omit<PressableProps, 'children'> & {
  label: string;
  variant?: ButtonVariant;
  loading?: boolean;
  /**
   * When true, disable the control while offline and surface a clear reason
   * instead of letting the tap fail after the fact.
   */
  requiresNetwork?: boolean;
};

/**
 * Primary fill lives on an inner View so Reanimated's AnimatedPressable
 * transform cannot drop backgroundColor (white onPrimary on a missing fill
 * made Send OTP / Save defaults look invisible).
 */
export function Button({
  label,
  variant = 'primary',
  loading = false,
  disabled,
  requiresNetwork = false,
  style,
  accessibilityHint,
  ...rest
}: ButtonProps) {
  const colors = useTheme();
  const { t } = useLanguage();
  const { isOffline } = useNetworkOptional();
  const offlineBlocked = requiresNetwork && isOffline;
  const isDisabled = Boolean(disabled) || loading || offlineBlocked;
  const displayLabel = offlineBlocked ? t('network.unavailableOffline') : label;

  const backgroundColor =
    variant === 'primary' ? colors.primary : variant === 'danger' ? colors.danger : colors.elevated;
  const foreground =
    variant === 'primary' ? colors.onPrimary : variant === 'danger' ? colors.onDanger : colors.text;

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      accessibilityHint={
        offlineBlocked ? t('network.unavailableOffline') : accessibilityHint
      }
      disabled={isDisabled}
      style={(state) => [
        styles.pressable,
        { opacity: isDisabled ? 0.5 : 1 },
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}>
      <View
        testID={rest.testID ? `${String(rest.testID)}-surface` : undefined}
        style={[
          styles.base,
          { backgroundColor, borderColor: colors.border },
          variant === 'secondary' && styles.secondary,
        ]}>
        {loading ? (
          <ActivityIndicator color={foreground} />
        ) : (
          <ThemedText type="smallBold" style={{ color: foreground }}>
            {displayLabel}
          </ThemedText>
        )}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  pressable: {
    alignSelf: 'stretch',
    minHeight: MinTouchTarget,
    minWidth: MinTouchTarget,
  },
  base: {
    minHeight: MinTouchTarget,
    minWidth: MinTouchTarget,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondary: {
    borderWidth: 1,
  },
});
