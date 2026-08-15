import { StyleSheet, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useLanguage } from '@/providers/language-provider';
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
  const { t } = useLanguage();

  if (items.length === 0) {
    return <ThemedText type="small">{t('items.releaseEmpty')}</ThemedText>;
  }

  return (
    <View style={styles.list}>
      {items.map((item) => {
        const checked = checkedIds.has(item.id);
        return (
          <PressableScale
            key={item.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked, disabled }}
            testID={`item-check-${item.position}`}
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
                {t('items.quantityWeight', { qty: item.quantity, weight: formatMg(item.net_weight_mg) })}
                {item.description ? ` · ${item.description}` : ''}
              </ThemedText>
            </View>
          </PressableScale>
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
