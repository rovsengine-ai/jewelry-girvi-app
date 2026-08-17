import type { Href } from 'expo-router';

import type { UserRole } from '@/types/database';

export const ADMIN_LOANS_HREF = '/(admin)/(tabs)/loans' as Href;
export const CUSTOMER_LOANS_HREF = '/(customer)/(tabs)/loans' as Href;
export const ADMIN_INSIGHTS_HREF = '/(admin)/(tabs)/insights' as Href;
export const ADMIN_ARCHIVE_HREF = '/(admin)/archive' as Href;

export function isShopOwner(role: UserRole | undefined): boolean {
  return role === 'owner';
}

/**
 * Tab-bar href for Insights. `null` hides the tab (Expo Router).
 * Hiding a tab is not a permission — pair with an in-screen owner check.
 * https://docs.expo.dev/router/advanced/tabs/
 */
export function insightsTabHref(role: UserRole | undefined): Href | null {
  return isShopOwner(role) ? ADMIN_INSIGHTS_HREF : null;
}

/** True when the current route is the owner-only Archive stack screen. */
export function isArchiveRoute(segments: readonly string[]): boolean {
  return segments.includes('archive');
}
