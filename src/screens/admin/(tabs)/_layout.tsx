/**
 * Shop tab bar. Insights is hidden for staff via href: null; the screen itself
 * still refuses non-owners. Calculator is owner and staff. Customers never
 * reach this layout. https://docs.expo.dev/router/advanced/tabs/
 * Icons: https://docs.expo.dev/versions/v57.0.0/sdk/symbols/
 */
import { Tabs } from 'expo-router';

import { useGlassTabBarOptions } from '@/components/glass-tab-bar-options';
import { TabBarSymbol } from '@/components/tab-bar-symbol';
import { insightsTabHref } from '@/lib/shop-tab-access';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';

export default function AdminTabsLayout() {
  const { profile } = useAuth();
  const { t } = useLanguage();
  const screenOptions = useGlassTabBarOptions();

  return (
    <Tabs screenOptions={screenOptions}>
      <Tabs.Screen
        name="loans"
        options={{
          title: t('loans.tab'),
          tabBarIcon: ({ color, size }) => (
            <TabBarSymbol ios="list.bullet" android="list" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="calculator"
        options={{
          title: t('tabs.calculator'),
          tabBarIcon: ({ color, size }) => (
            <TabBarSymbol
              ios="plus.forwardslash.minus"
              android="calculate"
              color={color}
              size={size}
            />
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
        name="insights"
        options={{
          title: t('tabs.insights'),
          href: insightsTabHref(profile?.role),
          tabBarIcon: ({ color, size }) => (
            <TabBarSymbol ios="chart.bar" android="bar_chart" color={color} size={size} />
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
