import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type PressableProps, type ViewProps } from 'react-native';
import * as Haptics from 'expo-haptics';

import { Sizes, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function listRowFill(pressed: boolean, fill: string, selected: string): string {
  return pressed ? selected : fill;
}

export type ListRowProps = Omit<PressableProps, 'children' | 'style'> & {
  leading?: ReactNode;
  content: ReactNode;
  trailing?: ReactNode;
  isLast?: boolean;
  tone?: 'surface' | 'elevated';
};

export function ListRow({
  leading,
  content,
  trailing,
  isLast = false,
  tone = 'elevated',
  onPress,
  disabled,
  testID,
  accessibilityRole,
  accessibilityLabel,
  accessibilityState,
  ...rest
}: ListRowProps) {
  const colors = useTheme();
  const dividerInset = Spacing.three + (leading ? Sizes.avatar + Spacing.three : 0);
  const fill = colors[tone];
  const pressable = typeof onPress === 'function';

  const body = (
    <>
      <View style={styles.inner}>
        {leading ? <View style={styles.leading}>{leading}</View> : null}
        <View style={styles.content}>{content}</View>
        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      </View>
      {isLast ? null : (
        <View
          testID={testID ? `${testID}-divider` : undefined}
          style={[
            styles.divider,
            {
              backgroundColor: colors.divider,
              marginLeft: dividerInset,
            },
          ]}
        />
      )}
    </>
  );

  const surface = {
    backgroundColor: fill,
    minHeight: Sizes.listRowMinHeight,
  };

  if (!pressable) {
    return (
      <View testID={testID} style={surface} {...(rest as ViewProps)}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      testID={testID}
      disabled={disabled}
      accessibilityRole={accessibilityRole ?? 'button'}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
      style={({ pressed: isPressed }) => ({
        backgroundColor: listRowFill(isPressed, fill, colors.backgroundSelected),
        minHeight: Sizes.listRowMinHeight,
      })}
      {...rest}
      onPress={onPress}
      onPressIn={() => {
        void Haptics.selectionAsync();
      }}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: Sizes.listRowMinHeight,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: Spacing.three,
  },
  leading: {
    width: Sizes.avatar,
    height: Sizes.avatar,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.half,
  },
  trailing: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: Spacing.half,
    flexShrink: 0,
  },
  divider: {
    height: Sizes.hairline,
  },
});
