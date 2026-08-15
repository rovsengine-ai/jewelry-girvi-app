/**
 * DOC GATE (Expo SDK 57 / RN 0.86.2):
 * https://reactnative.dev/docs/text
 * package: react-native Text  last-modified: NOT VERIFIABLE (docs page has no date)
 *
 * Money never wraps or ellipsizes. Tabular lining figures via fontVariant.
 * adjustsFontSizeToFit + numberOfLines={1} + ellipsizeMode="clip" shrinks
 * instead of showing "…". allowFontScaling stays default true (OS 200%).
 */
import { StyleSheet } from 'react-native';

import { ThemedText, type ThemedTextProps } from '@/components/themed-text';
import { Fonts, TypeScale } from '@/constants/theme';
import { formatPaiseAsInr, type Paise } from '@/lib/money';

export type MoneyTextProps = Omit<ThemedTextProps, 'children'> & {
  paise: Paise;
  size?: 'default' | 'large';
};

export function MoneyText({ paise, size = 'default', style, ...rest }: MoneyTextProps) {
  return (
    <ThemedText
      accessibilityRole="text"
      adjustsFontSizeToFit
      minimumFontScale={0.5}
      numberOfLines={1}
      ellipsizeMode="clip"
      style={[
        size === 'large' ? styles.moneyLarge : styles.money,
        { fontVariant: ['tabular-nums', 'lining-nums'] },
        style,
      ]}
      {...rest}>
      {formatPaiseAsInr(paise)}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  money: {
    ...TypeScale.money,
    fontFamily: Fonts.sans,
    flexShrink: 1,
  },
  moneyLarge: {
    ...TypeScale.moneyLarge,
    fontFamily: Fonts.sans,
    flexShrink: 1,
  },
});
