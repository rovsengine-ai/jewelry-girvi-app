import { render, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, Platform, Text } from 'react-native';

import { Colors } from '@/constants/theme';
import { flatStyle } from '@/test-utils/flat-style';

jest.mock('expo-glass-effect', () => {
  const React = require('react');
  const { View: RNView } = require('react-native');
  return {
    GlassView: ({
      children,
      ...rest
    }: {
      children?: React.ReactNode;
      [key: string]: unknown;
    }) =>
      React.createElement(RNView, { ...rest, testID: 'native-glass' }, children),
    isLiquidGlassAvailable: jest.fn(() => false),
    isGlassEffectAPIAvailable: jest.fn(() => false),
  };
});

jest.mock('expo-blur', () => {
  const React = require('react');
  const { View: RNView } = require('react-native');
  return {
    BlurView: ({
      children,
      ...rest
    }: {
      children?: React.ReactNode;
      [key: string]: unknown;
    }) => React.createElement(RNView, { ...rest, testID: 'blur-view' }, children),
    BlurTargetView: ({
      children,
      ...rest
    }: {
      children?: React.ReactNode;
      [key: string]: unknown;
    }) => React.createElement(RNView, { ...rest, testID: 'blur-target' }, children),
  };
});

import {
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from 'expo-glass-effect';

import { GlassSurface } from '@/components/glass-surface';

const liquidMock = isLiquidGlassAvailable as jest.MockedFunction<typeof isLiquidGlassAvailable>;
const apiMock = isGlassEffectAPIAvailable as jest.MockedFunction<typeof isGlassEffectAPIAvailable>;

function setOs(os: typeof Platform.OS) {
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
}

describe('<GlassSurface />', () => {
  const originalOs = Platform.OS;
  const originalAndroidBlur = process.env.EXPO_PUBLIC_ENABLE_ANDROID_BLUR;

  beforeEach(() => {
    liquidMock.mockReturnValue(false);
    apiMock.mockReturnValue(false);
    process.env.EXPO_PUBLIC_ENABLE_ANDROID_BLUR = undefined;
    jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({
      remove: jest.fn(),
    } as unknown as ReturnType<typeof AccessibilityInfo.addEventListener>);
  });

  afterEach(() => {
    setOs(originalOs);
    process.env.EXPO_PUBLIC_ENABLE_ANDROID_BLUR = originalAndroidBlur;
    jest.restoreAllMocks();
  });

  test('iOS BlurView branch renders children', async () => {
    setOs('ios');
    const { getByText, getByTestId } = await render(
      <GlassSurface>
        <Text>Chrome</Text>
      </GlassSurface>,
    );
    getByText('Chrome');
    getByTestId('blur-view');
  });

  test('iOS Liquid Glass branch renders children', async () => {
    setOs('ios');
    liquidMock.mockReturnValue(true);
    apiMock.mockReturnValue(true);
    const { getByText, getByTestId, queryByTestId } = await render(
      <GlassSurface>
        <Text>Chrome</Text>
      </GlassSurface>,
    );
    getByText('Chrome');
    getByTestId('native-glass');
    expect(queryByTestId('blur-view')).toBeNull();
  });

  test('Android default branch renders children on a tinted View', async () => {
    setOs('android');
    const { getByText, getByTestId, queryByTestId } = await render(
      <GlassSurface testID="glass-surface">
        <Text>Chrome</Text>
      </GlassSurface>,
    );
    getByText('Chrome');
    expect(queryByTestId('blur-view')).toBeNull();
    expect(queryByTestId('native-glass')).toBeNull();
    expect(flatStyle(getByTestId('glass-surface'))).toMatchObject({
      backgroundColor: Colors.light.glassTintStrong,
      borderColor: Colors.light.glassBorder,
    });
  });

  test('Android blur flag without blurTarget stays tinted (no dimezis warning)', async () => {
    setOs('android');
    process.env.EXPO_PUBLIC_ENABLE_ANDROID_BLUR = 'true';
    const { getByText, getByTestId, queryByTestId } = await render(
      <GlassSurface testID="glass-surface">
        <Text>Chrome</Text>
      </GlassSurface>,
    );
    getByText('Chrome');
    expect(queryByTestId('blur-view')).toBeNull();
    expect(flatStyle(getByTestId('glass-surface'))).toMatchObject({
      backgroundColor: Colors.light.glassTintStrong,
    });
  });

  test('Android androidBlur without blurTarget stays tinted', async () => {
    setOs('android');
    process.env.EXPO_PUBLIC_ENABLE_ANDROID_BLUR = undefined;
    const { getByText, getByTestId, queryByTestId } = await render(
      <GlassSurface androidBlur testID="glass-surface">
        <Text>Chrome</Text>
      </GlassSurface>,
    );
    getByText('Chrome');
    expect(queryByTestId('blur-view')).toBeNull();
    expect(flatStyle(getByTestId('glass-surface'))).toMatchObject({
      backgroundColor: Colors.light.glassTintStrong,
    });
  });

  test('Android androidBlur with blurTarget uses BlurView', async () => {
    setOs('android');
    process.env.EXPO_PUBLIC_ENABLE_ANDROID_BLUR = undefined;
    const blurTarget = { current: null };
    const { getByText, getByTestId } = await render(
      <GlassSurface androidBlur blurTarget={blurTarget}>
        <Text>Chrome</Text>
      </GlassSurface>,
    );
    getByText('Chrome');
    getByTestId('blur-view');
  });

  test('solid forces the opaque branch', async () => {
    setOs('ios');
    liquidMock.mockReturnValue(true);
    apiMock.mockReturnValue(true);
    const { getByText, getByTestId, queryByTestId } = await render(
      <GlassSurface solid testID="glass-surface">
        <Text>Chrome</Text>
      </GlassSurface>,
    );
    getByText('Chrome');
    expect(queryByTestId('native-glass')).toBeNull();
    expect(queryByTestId('blur-view')).toBeNull();
    expect(flatStyle(getByTestId('glass-surface'))).toMatchObject({
      backgroundColor: Colors.light.glassTintStrong,
    });
  });

  test('web does not call isReduceTransparencyEnabled', async () => {
    setOs('web');
    const spy = jest
      .spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled')
      .mockImplementation(() => {
        throw new Error('web has no reduce-transparency API');
      });
    spy.mockClear();
    const { getByText } = await render(
      <GlassSurface>
        <Text>Chrome</Text>
      </GlassSurface>,
    );
    getByText('Chrome');
    expect(spy).not.toHaveBeenCalled();
  });

  test('reduce-transparency forces the opaque branch', async () => {
    setOs('ios');
    jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(true);
    const { getByText, getByTestId, queryByTestId } = await render(
      <GlassSurface testID="glass-surface">
        <Text>Chrome</Text>
      </GlassSurface>,
    );
    getByText('Chrome');
    await waitFor(() => {
      expect(queryByTestId('blur-view')).toBeNull();
      expect(flatStyle(getByTestId('glass-surface'))).toMatchObject({
        backgroundColor: Colors.light.glassTintStrong,
      });
    });
  });
});
