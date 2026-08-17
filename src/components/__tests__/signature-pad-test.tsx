import { cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { createRef, type ComponentProps, type RefObject } from 'react';
import { ScrollView } from 'react-native';

import { SignaturePad, type SignaturePadRef } from '@/components/signature-pad';
import { Sizes } from '@/constants/theme';

const mockReadSignature = jest.fn();
const mockClearSignature = jest.fn();

jest.mock('@/providers/language-provider', () => ({
  useLanguage: () => ({
    language: 'en' as const,
    setLanguage: jest.fn(),
    t: (key: string) => {
      const labels: Record<string, string> = {
        'signaturePad.captured': 'Signature captured',
        'signaturePad.notSignedYet': 'Not signed yet',
        'common.clear': 'Clear',
      };
      return labels[key] ?? key;
    },
  }),
  LanguageProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('react-native-signature-canvas', () => {
  const React = require('react');
  const { Pressable, View } = require('react-native');

  return {
    __esModule: true,
    default: React.forwardRef(function MockSignatureCanvas(
      {
        onBegin,
        onEnd,
        onOK,
        onEmpty,
        onDraw,
        onClear,
      }: {
        onBegin?: () => void;
        onEnd?: () => void;
        onOK?: (sig: string) => void;
        onEmpty?: () => void;
        onDraw?: () => void;
        onClear?: () => void;
      },
      ref: React.Ref<{ readSignature: () => void; clearSignature: () => void }>,
    ) {
      React.useImperativeHandle(ref, () => ({
        readSignature: () => {
          mockReadSignature();
          onOK?.('data:image/png;base64,MOCK');
        },
        clearSignature: () => {
          mockClearSignature();
          onClear?.();
          onEmpty?.();
        },
      }));

      return (
        <View testID="mock-signature-canvas">
          <Pressable testID="mock-signature-begin" onPress={onBegin} />
          <Pressable testID="mock-signature-end" onPress={onEnd} />
          <Pressable testID="mock-signature-draw" onPress={onDraw} />
        </View>
      );
    }),
  };
});

function renderPad(
  props: Partial<ComponentProps<typeof SignaturePad>> = {},
) {
  return render(<SignaturePad height={Sizes.signaturePadHeightCompact} testID="signature-pad" {...props} />);
}

describe('<SignaturePad />', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mockReadSignature.mockClear();
    mockClearSignature.mockClear();
  });

  test('readSignature resolves the data URL from onOK', async () => {
    const padRef = createRef<SignaturePadRef>();

    await render(<SignaturePad ref={padRef} height={Sizes.signaturePadHeightCompact} testID="signature-pad" />);

    await waitFor(() => {
      expect(padRef.current).not.toBeNull();
    });

    const result = await padRef.current!.readSignature();
    expect(result).toBe('data:image/png;base64,MOCK');
    expect(mockReadSignature).toHaveBeenCalledTimes(1);
  });

  test('shows captured status after drawing', async () => {
    const { getByTestId, getByText } = await renderPad();

    expect(getByText('Not signed yet')).toBeTruthy();

    fireEvent.press(getByTestId('mock-signature-draw'));

    await waitFor(() => {
      expect(getByText('Signature captured')).toBeTruthy();
    });
  });

  test('clear resets status to not signed', async () => {
    const { getByTestId, getByText } = await renderPad();

    fireEvent.press(getByTestId('mock-signature-draw'));
    await waitFor(() => {
      expect(getByText('Signature captured')).toBeTruthy();
    });

    fireEvent.press(getByTestId('signature-pad-clear'));

    await waitFor(() => {
      expect(getByText('Not signed yet')).toBeTruthy();
    });
    expect(mockClearSignature).toHaveBeenCalled();
  });

  test('onBegin disables parent scroll and onEnd re-enables it', async () => {
    const onDrawingChange = jest.fn();
    const setNativeProps = jest.fn();
    const scrollRef = {
      current: { setNativeProps },
    } as unknown as RefObject<ScrollView>;

    const { getByTestId } = await render(
      <SignaturePad
        height={Sizes.signaturePadHeightCompact}
        scrollRef={scrollRef}
        onDrawingChange={onDrawingChange}
        testID="signature-pad"
      />,
    );

    fireEvent.press(getByTestId('mock-signature-begin'));
    expect(onDrawingChange).toHaveBeenCalledWith(true);
    expect(setNativeProps).toHaveBeenCalledWith({ scrollEnabled: false });

    fireEvent.press(getByTestId('mock-signature-end'));
    expect(onDrawingChange).toHaveBeenCalledWith(false);
    expect(setNativeProps).toHaveBeenCalledWith({ scrollEnabled: true });
  });
});
