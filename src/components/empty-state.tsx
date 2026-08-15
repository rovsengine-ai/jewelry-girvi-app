import { View, type ViewProps } from 'react-native';
import type { AndroidSymbol } from 'expo-symbols';
import type { SFSymbol } from 'sf-symbols-typescript';

import { AppIcon } from '@/components/app-icon';
import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Spacing, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useLanguage } from '@/providers/language-provider';

export function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
  iconIos = 'tray',
  iconAndroid = 'inbox',
  style,
  ...rest
}: ViewProps & {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  iconIos?: SFSymbol;
  iconAndroid?: AndroidSymbol;
}) {
  const colors = useTheme();
  const { t } = useLanguage();

  return (
    <View
      style={[{ gap: Spacing.two, padding: Spacing.four, alignItems: 'center' }, style]}
      {...rest}>
      <AppIcon
        ios={iconIos}
        android={iconAndroid}
        color={colors.textSecondary}
        size={Spacing.five}
        accessibilityLabel={t('a11y.empty')}
      />
      <ThemedText type="subtitle" style={{ ...TypeScale.title, textAlign: 'center' }}>
        {title}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
        {body}
      </ThemedText>
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} /> : null}
    </View>
  );
}
