import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

export function FormNotice({
  error,
  notice,
}: {
  error?: string | null;
  notice?: string | null;
}) {
  const colors = useTheme();

  if (error) {
    return (
      <ThemedText
        type="small"
        testID="screen-error"
        accessibilityRole="alert"
        style={{ color: colors.danger }}>
        {error}
      </ThemedText>
    );
  }

  if (notice) {
    return (
      <ThemedText type="small" testID="screen-notice" style={{ color: colors.success }}>
        {notice}
      </ThemedText>
    );
  }

  return null;
}
