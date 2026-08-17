import { PixelRatio, View } from 'react-native';

import { render } from '@testing-library/react-native';

import { MinTouchTarget } from '@/constants/theme';
import { tabBarOccupiedHeight, tabBarScrollPadding } from '@/lib/tab-bar-inset';
import { flatStyle } from '@/test-utils/flat-style';

/**
 * Named device: Google Pixel 4a (5.81", 393×851 dp).
 * 3-button navigation bar is 48 dp on this device.
 * Jest cannot rasterize a real compositor; this asserts the padding vs
 * absolute tab-bar height that keeps the last list row clear of the bar.
 */
const PIXEL_4A = { width: 393, height: 851 };
const PIXEL_4A_NAV_INSET = 48;

function Pixel4aTabListFixture() {
  const paddingBottom = tabBarScrollPadding(PIXEL_4A_NAV_INSET);
  const tabBarHeight = tabBarOccupiedHeight(PIXEL_4A_NAV_INSET);

  return (
    <View testID="screen" style={{ width: PIXEL_4A.width, height: PIXEL_4A.height }}>
      <View testID="list" style={{ flex: 1, paddingBottom }}>
        <View testID="last-row" style={{ minHeight: MinTouchTarget, marginTop: 'auto' }} />
      </View>
      <View
        testID="tab-bar"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: tabBarHeight,
        }}
      />
    </View>
  );
}

describe('Pixel 4a tab bar vs last list row', () => {
  const previousFontScale = PixelRatio.getFontScale();

  beforeAll(() => {
    jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(2);
  });

  afterAll(() => {
    jest.restoreAllMocks();
    expect(previousFontScale).toBeDefined();
  });

  test('list padding clears the absolute tab bar at 393×851', async () => {
    const { getByTestId } = await render(<Pixel4aTabListFixture />);

    const paddingBottom = tabBarScrollPadding(PIXEL_4A_NAV_INSET);
    const tabBarHeight = tabBarOccupiedHeight(PIXEL_4A_NAV_INSET);

    expect(PixelRatio.getFontScale()).toBe(2);
    expect(flatStyle(getByTestId('screen'))).toMatchObject(PIXEL_4A);
    expect(flatStyle(getByTestId('list')).paddingBottom).toBe(paddingBottom);
    expect(flatStyle(getByTestId('tab-bar'))).toMatchObject({
      position: 'absolute',
      bottom: 0,
      height: tabBarHeight,
    });
    expect(flatStyle(getByTestId('last-row')).minHeight).toBe(MinTouchTarget);

    // Last row sits in the padded region; the bar occupies [851 - height, 851].
    // No overlap iff paddingBottom >= tabBarHeight.
    expect(paddingBottom).toBeGreaterThanOrEqual(tabBarHeight);
    expect(PIXEL_4A.height - paddingBottom).toBeGreaterThanOrEqual(MinTouchTarget);
  });
});
