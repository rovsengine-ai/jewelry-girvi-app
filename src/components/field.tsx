import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type FieldProps = Omit<TextInputProps, 'style'> & {
  label: string;
  error?: string | null;
};

export function Field({ label, error, testID, ...inputProps }: FieldProps) {
  const colors = useTheme();
  const errorId = error ? `${testID ?? label}-error` : undefined;

  return (
    <View style={styles.wrap}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <TextInput
        accessibilityLabel={label}
        accessibilityState={{ disabled: Boolean(inputProps.editable === false) }}
        aria-invalid={Boolean(error)}
        placeholderTextColor={colors.textSecondary}
        style={[
          styles.input,
          {
            borderColor: error ? colors.danger : colors.border,
            color: colors.text,
            backgroundColor: colors.surface,
          },
        ]}
        testID={testID}
        {...inputProps}
      />
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
  input: {
    minHeight: MinTouchTarget,
    borderWidth: 1,
    borderRadius: Radii.sm,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
