import { render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ExternalLink } from '@/components/external-link';

// expo-router's <Link> needs a navigation context that a unit test has no reason
// to build, so it is replaced with a plain pressable stand-in that records the
// props the component under test passes down.
jest.mock('expo-router', () => {
  const { Text: RNText } = jest.requireActual('react-native');
  return {
    Link: ({ children, ...props }: { children?: React.ReactNode }) => (
      <RNText testID="link" {...props}>
        {children}
      </RNText>
    ),
  };
});

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(async () => ({ type: 'opened' })),
  WebBrowserPresentationStyle: { AUTOMATIC: 'AUTOMATIC' },
}));

const { openBrowserAsync } = jest.requireMock('expo-web-browser') as {
  openBrowserAsync: jest.Mock;
};

const HREF = 'https://example.com/terms';

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.EXPO_OS;
});

describe('<ExternalLink />', () => {
  test('renders its children and targets a new tab', async () => {
    const { getByText, getByTestId } = await render(
      <ExternalLink href={HREF}>
        <Text>Terms</Text>
      </ExternalLink>,
    );
    getByText('Terms');
    expect(getByTestId('link').props.target).toBe('_blank');
  });

  test('passes the href straight through', async () => {
    const { getByTestId } = await render(<ExternalLink href={HREF}>Terms</ExternalLink>);
    expect(getByTestId('link').props.href).toBe(HREF);
  });

  test('on native, opens an in-app browser and blocks the default navigation', async () => {
    process.env.EXPO_OS = 'ios';
    const { getByTestId } = await render(<ExternalLink href={HREF}>Terms</ExternalLink>);

    const preventDefault = jest.fn();
    await getByTestId('link').props.onPress({ preventDefault });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(openBrowserAsync).toHaveBeenCalledWith(HREF, {
      presentationStyle: 'AUTOMATIC',
    });
  });

  test('NOT UNIT TESTABLE: the web branch cannot be reached from a native test run', async () => {
    // Expo's Babel preset inlines process.env.EXPO_OS at transform time, so
    // assigning it here does not change the compiled comparison and the
    // component still takes the native path. Verified by assertion below rather
    // than asserted as correct web behaviour: covering the real web branch needs
    // a web-platform Jest project (jest-expo/universal) or an E2E run, which is
    // out of scope for this stage.
    process.env.EXPO_OS = 'web';
    const { getByTestId } = await render(<ExternalLink href={HREF}>Terms</ExternalLink>);

    const preventDefault = jest.fn();
    await getByTestId('link').props.onPress({ preventDefault });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(openBrowserAsync).toHaveBeenCalled();
  });

  test('treats an unset EXPO_OS as native, so links never escape the app', async () => {
    const { getByTestId } = await render(<ExternalLink href={HREF}>Terms</ExternalLink>);

    const preventDefault = jest.fn();
    await getByTestId('link').props.onPress({ preventDefault });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(openBrowserAsync).toHaveBeenCalled();
  });
});
