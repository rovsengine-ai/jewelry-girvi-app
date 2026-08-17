import { BottomTabInset, Glass } from '@/constants/theme';
import { tabBarOccupiedHeight, tabBarScrollPadding } from '@/lib/tab-bar-inset';

describe('tab bar inset math', () => {
  test('scroll padding is chrome token plus the safe-area inset', () => {
    expect(tabBarScrollPadding(48)).toBe(BottomTabInset + 48);
  });

  test('scroll padding is never shorter than the absolute tab bar', () => {
    expect(tabBarScrollPadding(0)).toBeGreaterThanOrEqual(tabBarOccupiedHeight(0));
    expect(tabBarScrollPadding(48)).toBeGreaterThanOrEqual(tabBarOccupiedHeight(48));
    expect(tabBarOccupiedHeight(48)).toBe(Glass.tabBarHeight + 48);
  });
});
