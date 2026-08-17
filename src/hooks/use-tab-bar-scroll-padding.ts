import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { tabBarScrollPadding } from '@/lib/tab-bar-inset';

export function useTabBarScrollPadding(): number {
  const insets = useSafeAreaInsets();
  return tabBarScrollPadding(insets.bottom);
}
