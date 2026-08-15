import { ThemedText } from '@/components/themed-text';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function FormNotice({
  error,
  notice,
  info,
}: {
  error?: string | null;
  notice?: string | null;
  info?: string | null;
}) {
  const colors = useTheme();

  if (!error && !notice && !info) {
    return null;
  }

  return (
    <>
      {info ? (
        <ThemedText
          type="small"
          testID="screen-info"
          style={{
            backgroundColor: colors.tintPrimary,
            borderRadius: Radii.sm,
            padding: Spacing.two,
            overflow: 'hidden',
          }}>
          {info}
        </ThemedText>
      ) : null}
      {error ? (
        <ThemedText
          type="small"
          testID="screen-error"
          accessibilityRole="alert"
          style={{
            color: colors.onTintDanger,
            backgroundColor: colors.tintDanger,
            borderRadius: Radii.sm,
            padding: Spacing.two,
            overflow: 'hidden',
          }}>
          {error}
        </ThemedText>
      ) : notice ? (
        <ThemedText
          type="small"
          testID="screen-notice"
          style={{
            color: colors.onTintSuccess,
            backgroundColor: colors.tintSuccess,
            borderRadius: Radii.sm,
            padding: Spacing.two,
            overflow: 'hidden',
          }}>
          {notice}
        </ThemedText>
      ) : null}
    </>
  );
}
