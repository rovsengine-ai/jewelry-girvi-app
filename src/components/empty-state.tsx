import { View, type ViewProps } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

export function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
  style,
  ...rest
}: ViewProps & {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={[{ gap: Spacing.two, padding: Spacing.four, alignItems: 'center' }, style]} {...rest}>
      <ThemedText type="subtitle" style={{ fontSize: 22, lineHeight: 28, textAlign: 'center' }}>
        {title}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
        {body}
      </ThemedText>
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} /> : null}
    </View>
  );
}
