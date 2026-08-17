import { insightsTabHref, isArchiveRoute, isShopOwner } from '@/lib/shop-tab-access';

describe('insights tab access', () => {
  test('owner may see the Insights tab', () => {
    expect(isShopOwner('owner')).toBe(true);
    expect(insightsTabHref('owner')).toBe('/(admin)/(tabs)/insights');
  });

  test('staff tab href is null (hiding a tab is not a permission)', () => {
    expect(isShopOwner('staff')).toBe(false);
    expect(insightsTabHref('staff')).toBeNull();
  });

  test('customer roles are not shop owners', () => {
    expect(isShopOwner('retail_customer')).toBe(false);
    expect(insightsTabHref('retail_customer')).toBeNull();
  });
});

describe('archive route', () => {
  test('matches the owner-only archive stack screen', () => {
    expect(isArchiveRoute(['(admin)', 'archive'])).toBe(true);
    expect(isArchiveRoute(['(admin)', '(tabs)', 'settings'])).toBe(false);
  });
});
