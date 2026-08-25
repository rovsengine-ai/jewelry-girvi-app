import {
  ADMIN_CALCULATOR_HREF,
  insightsTabHref,
  isArchiveRoute,
  isShopOwner,
  isShopUser,
} from '@/lib/shop-tab-access';

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

describe('shop user', () => {
  test('owner and staff are shop users', () => {
    expect(isShopUser('owner')).toBe(true);
    expect(isShopUser('staff')).toBe(true);
    expect(ADMIN_CALCULATOR_HREF).toBe('/(admin)/(tabs)/calculator');
  });

  test('customers are not shop users', () => {
    expect(isShopUser('retail_customer')).toBe(false);
    expect(isShopUser('merchant')).toBe(false);
    expect(isShopUser(undefined)).toBe(false);
  });
});

describe('archive route', () => {
  test('matches the owner-only archive stack screen', () => {
    expect(isArchiveRoute(['(admin)', 'archive'])).toBe(true);
    expect(isArchiveRoute(['(admin)', '(tabs)', 'settings'])).toBe(false);
  });
});
