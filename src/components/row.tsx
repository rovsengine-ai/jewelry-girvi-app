import { View, type ViewProps } from 'react-native';

import { MinTouchTarget, Spacing } from '@/constants/theme';

export function Row({ style, ...rest }: ViewProps) {
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: Spacing.two,
          minHeight: MinTouchTarget,
        },
        style,
      ]}
      {...rest}
    />
  );
}
