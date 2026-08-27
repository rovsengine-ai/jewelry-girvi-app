/**
 * GIRVI SEWA seal / wordmark for chrome headers and public web pages.
 */
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';

type BrandMarkProps = {
  size?: 'sm' | 'md' | 'lg';
  /** When true, show the horizontal wordmark instead of the seal alone. */
  wordmark?: boolean;
};

const SIZES = {
  sm: 28,
  md: 36,
  lg: 64,
} as const;

export function BrandMark({ size = 'md', wordmark = false }: BrandMarkProps) {
  if (wordmark) {
    const height = SIZES[size] + 8;
    return (
      <View
        accessibilityRole="image"
        accessibilityLabel="GIRVI SEWA"
        style={[styles.wordmarkWrap, { height }]}>
        <Image
          source={require('@/assets/images/brand-wordmark.png')}
          style={{ width: height * 2.4, height }}
          contentFit="contain"
        />
      </View>
    );
  }

  const dim = SIZES[size];
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="GIRVI SEWA"
      style={[styles.sealWrap, { width: dim, height: dim }]}>
      <Image
        source={require('@/assets/images/brand-mark.png')}
        style={{ width: dim, height: dim }}
        contentFit="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sealWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmarkWrap: {
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginRight: Spacing.one,
  },
});
