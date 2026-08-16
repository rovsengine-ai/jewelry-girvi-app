import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, ThemeColor, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?:
    | 'default'
    | 'title'
    | 'small'
    | 'smallBold'
    | 'subtitle'
    | 'link'
    | 'linkPrimary'
    | 'code'
    | 'overline'
    | 'label'
    | 'bodyLarge'
    | 'bodyBold'
    | 'moneyLarge'
    | 'caption';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return (
    <Text
      style={[
        { color: theme[themeColor ?? 'text'] },
        type === 'default' && styles.default,
        type === 'title' && styles.title,
        type === 'small' && styles.small,
        type === 'smallBold' && styles.smallBold,
        type === 'subtitle' && styles.subtitle,
        type === 'link' && styles.link,
        type === 'linkPrimary' && styles.linkPrimary,
        type === 'linkPrimary' && { color: theme.link },
        type === 'code' && styles.code,
        type === 'overline' && styles.overline,
        type === 'label' && styles.label,
        type === 'bodyLarge' && styles.bodyLarge,
        type === 'bodyBold' && styles.bodyBold,
        type === 'moneyLarge' && styles.moneyLarge,
        type === 'caption' && styles.caption,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  small: TypeScale.small,
  smallBold: { ...TypeScale.small, fontWeight: '700' },
  default: TypeScale.body,
  title: TypeScale.heroTitle,
  subtitle: TypeScale.heroSubtitle,
  link: TypeScale.link,
  linkPrimary: TypeScale.link,
  code: {
    ...TypeScale.codeSize,
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: '700' as const, default: '500' as const }),
  },
  overline: TypeScale.overline,
  label: TypeScale.label,
  bodyLarge: TypeScale.bodyLarge,
  bodyBold: TypeScale.bodyBold,
  moneyLarge: TypeScale.moneyLarge,
  caption: TypeScale.caption,
});
