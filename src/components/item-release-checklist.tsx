import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { LoanItem } from '@/types/database';

function formatMg(mg: number): string {
  if (mg % 1000 === 0) {
    return `${mg / 1000} g`;
  }
  return `${(mg / 1000).toFixed(3)} g`;
}

export function ItemReleaseChecklist({
  items,
  checkedIds,
  onToggle,
  disabled = false,
}: {
  items: LoanItem[];
  checkedIds: ReadonlySet<string>;
  onToggle: (id: string) => void;
  disabled?: boolean;
}) {
  const colors = useTheme();

  if (items.length === 0) {
    return <ThemedText type="small">No pledged items on this loan.</ThemedText>;
  }

  return (
    <View style={styles.list}>
      {items.map((item) => {
        const checked = checkedIds.has(item.id);
        return (
          <Pressable
            key={item.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked, disabled }}
            testID={`item-check-${item.id}`}
            disabled={disabled}
            onPress={() => onToggle(item.id)}
            style={[
              styles.row,
              {
                backgroundColor: colors.background,
                borderColor: checked ? colors.text : colors.border,
                opacity: disabled ? 0.6 : 1,
              },
            ]}>
            <View
              style={[
                styles.box,
                {
                  borderColor: colors.text,
                  backgroundColor: checked ? colors.text : 'transparent',
                },
              ]}
            />
            <View style={styles.body}>
              <ThemedText type="smallBold">{item.ornament_type}</ThemedText>
              <ThemedText type="small">
                {item.quantity} × {formatMg(item.net_weight_mg)}
                {item.description ? ` · ${item.description}` : ''}
              </ThemedText>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Radii.sm,
    padding: Spacing.two,
    minHeight: MinTouchTarget,
  },
  box: { width: 18, height: 18, borderWidth: 2, borderRadius: 4 },
  body: { flex: 1, gap: 2 },
});
