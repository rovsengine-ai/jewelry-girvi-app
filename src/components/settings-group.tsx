import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function SettingsGroup({ children }: { children: ReactNode }) {
  const colors = useTheme();

  return (
    <View
      style={[
        styles.group,
        {
          backgroundColor: colors.elevated,
        },
      ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    borderRadius: Radii.md,
    overflow: 'hidden',
  },
});
