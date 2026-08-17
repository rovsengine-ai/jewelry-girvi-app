/**
 * Customer tab bar.
 * https://docs.expo.dev/router/advanced/tabs/
 * Icons: https://docs.expo.dev/versions/v57.0.0/sdk/symbols/
 */
import { Tabs } from 'expo-router';

import { useGlassTabBarOptions } from '@/components/glass-tab-bar-options';
import { TabBarSymbol } from '@/components/tab-bar-symbol';
import { useLanguage } from '@/providers/language-provider';

export default function CustomerTabsLayout() {
  const screenOptions = useGlassTabBarOptions();
  const { t } = useLanguage();

  return (
    <Tabs screenOptions={screenOptions}>
      <Tabs.Screen
        name="loans"
        options={{
          title: t('tabs.myLoans'),
          tabBarIcon: ({ color, size }) => (
            <TabBarSymbol ios="doc.text" android="description" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: t('notices.tab'),
          tabBarIcon: ({ color, size }) => (
            <TabBarSymbol ios="bell" android="notifications" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('settings.tab'),
          tabBarIcon: ({ color, size }) => (
            <TabBarSymbol ios="gearshape" android="settings" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
