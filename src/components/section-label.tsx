import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

export function SectionLabel({ children }: { children: string }) {
  return (
    <ThemedText type="overline" themeColor="textSecondary" style={styles.label}>
      {children}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  label: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.one,
  },
});
