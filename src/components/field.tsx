/**
 * Form field with optional PIN visibility toggle.
 * https://docs.expo.dev/versions/v57.0.0/react-native/textinput/
 */
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useLanguage } from '@/providers/language-provider';

export type FieldProps = Omit<TextInputProps, 'style'> & {
  label: string;
  error?: string | null;
  /** When true, shows an eye control to reveal/hide secure text (PIN). */
  secureToggle?: boolean;
};

export function Field({
  label,
  error,
  testID,
  secureToggle = false,
  secureTextEntry,
  ...inputProps
}: FieldProps) {
  const colors = useTheme();
  const { t } = useLanguage();
  const [revealed, setRevealed] = useState(false);
  const errorId = error ? `${testID ?? label}-error` : undefined;
  const isSecure = Boolean(secureTextEntry) && !(secureToggle && revealed);

  return (
    <View style={styles.wrap}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <View style={styles.inputRow}>
        <TextInput
          accessibilityLabel={label}
          accessibilityState={{ disabled: Boolean(inputProps.editable === false) }}
          aria-invalid={Boolean(error)}
          placeholderTextColor={colors.textSecondary}
          style={[
            styles.input,
            secureToggle ? styles.inputWithToggle : null,
            {
              borderColor: error ? colors.danger : colors.border,
              color: colors.text,
              backgroundColor: colors.surface,
            },
          ]}
          testID={testID}
          secureTextEntry={isSecure}
          {...inputProps}
        />
        {secureToggle ? (
          <Pressable
            testID={testID ? `${testID}-toggle` : undefined}
            accessibilityRole="button"
            accessibilityLabel={revealed ? t('a11y.hidePin') : t('a11y.showPin')}
            accessibilityState={{ selected: revealed }}
            onPress={() => setRevealed((prev) => !prev)}
            style={styles.toggleHit}
            hitSlop={8}>
            <AppIcon
              ios={revealed ? 'eye.slash' : 'eye'}
              android={revealed ? 'visibility_off' : 'visibility'}
              color={colors.textSecondary}
            />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <ThemedText type="small" themeColor="textSecondary" nativeID={errorId} testID={errorId}>
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.one },
  inputRow: {
    position: 'relative',
    justifyContent: 'center',
  },
  input: {
    minHeight: MinTouchTarget,
    borderWidth: 1,
    borderRadius: Radii.sm,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  inputWithToggle: {
    paddingRight: MinTouchTarget + Spacing.two,
  },
  toggleHit: {
    position: 'absolute',
    right: Spacing.one,
    height: MinTouchTarget,
    width: MinTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
