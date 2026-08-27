/**
 * Shared signature canvas with ScrollView gesture isolation and imperative read.
 * react-native-signature-canvas 5.1.1 — WebView props verified in index.d.ts.
 */
import { forwardRef, useImperativeHandle, useRef, useState, type RefObject } from 'react';
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import SignatureCanvas from 'react-native-signature-canvas';
import type { SignatureViewRef } from 'react-native-signature-canvas';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Radii, Spacing } from '@/constants/theme';
import { useLanguage } from '@/providers/language-provider';

const SIGNATURE_WEB_STYLE = `
  .m-signature-pad { box-shadow: none; border: none; }
  .m-signature-pad--footer { display: none; }
`;

const READ_SIGNATURE_TIMEOUT_MS = 5000;

type PendingRead = {
  resolve: (value: string | null) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

export type SignaturePadRef = {
  readSignature: () => Promise<string | null>;
};

export type SignaturePadProps = {
  height: number;
  descriptionText?: string;
  autoClear?: boolean;
  scrollRef?: RefObject<ScrollView | null>;
  onDrawingChange?: (active: boolean) => void;
  testID?: string;
  style?: ViewStyle;
};

function setParentScrollEnabled(
  scrollRef: RefObject<ScrollView | null> | undefined,
  enabled: boolean,
) {
  scrollRef?.current?.setNativeProps({ scrollEnabled: enabled });
}

export const SignaturePad = forwardRef<SignaturePadRef, SignaturePadProps>(
  function SignaturePad(
    {
      height,
      descriptionText,
      autoClear = false,
      scrollRef,
      onDrawingChange,
      testID = 'signature-pad',
      style,
    },
    ref,
  ) {
    const { t } = useLanguage();
    const canvasRef = useRef<SignatureViewRef>(null);
    const pendingReadRef = useRef<PendingRead | null>(null);
    const [hasInk, setHasInk] = useState(false);

    const finishPendingRead = (
      outcome: { kind: 'resolve'; value: string | null } | { kind: 'reject'; error: Error },
    ) => {
      const pending = pendingReadRef.current;
      if (!pending) return;
      clearTimeout(pending.timeoutId);
      pendingReadRef.current = null;
      if (outcome.kind === 'resolve') {
        pending.resolve(outcome.value);
      } else {
        pending.reject(outcome.error);
      }
    };

    const handleBegin = () => {
      setParentScrollEnabled(scrollRef, false);
      onDrawingChange?.(true);
    };

    const handleEnd = () => {
      setParentScrollEnabled(scrollRef, true);
      onDrawingChange?.(false);
    };

    const handleOK = (signature: string) => {
      setHasInk(true);
      finishPendingRead({ kind: 'resolve', value: signature });
    };

    const handleEmpty = () => {
      setHasInk(false);
      finishPendingRead({ kind: 'resolve', value: null });
    };

    const handleError = (error: Error) => {
      finishPendingRead({ kind: 'reject', error });
    };

    const handleDraw = () => {
      setHasInk(true);
    };

    const handleClear = () => {
      setHasInk(false);
    };

    const clearPad = () => {
      canvasRef.current?.clearSignature();
      setHasInk(false);
    };

    useImperativeHandle(ref, () => ({
      readSignature: () =>
        new Promise<string | null>((resolve, reject) => {
          if (pendingReadRef.current) {
            finishPendingRead({ kind: 'resolve', value: null });
          }

          const timeoutId = setTimeout(() => {
            pendingReadRef.current = null;
            resolve(null);
          }, READ_SIGNATURE_TIMEOUT_MS);

          pendingReadRef.current = { resolve, reject, timeoutId };
          canvasRef.current?.readSignature();
        }),
    }));

    return (
      <View style={[styles.root, style]} testID={testID}>
        <ThemedText
          type="small"
          style={hasInk ? styles.statusCaptured : styles.statusEmpty}
          testID={`${testID}-status`}
        >
          {hasInk ? t('signaturePad.captured') : t('signaturePad.notSignedYet')}
        </ThemedText>
        <View style={[styles.box, { height }]}>
          <SignatureCanvas
            ref={canvasRef}
            onBegin={handleBegin}
            onEnd={handleEnd}
            onOK={handleOK}
            onEmpty={handleEmpty}
            onError={handleError}
            onDraw={handleDraw}
            onClear={handleClear}
            autoClear={autoClear}
            descriptionText={descriptionText}
            scrollable={false}
            nestedScrollEnabled={false}
            androidLayerType="hardware"
            webStyle={SIGNATURE_WEB_STYLE}
            webviewContainerStyle={[styles.webviewContainer, { height }]}
            style={styles.canvas}
          />
        </View>
        <Button
          testID={`${testID}-clear`}
          label={t('common.clear')}
          variant="secondary"
          onPress={clearPad}
        />
      </View>
    );
  },
);

const styles = StyleSheet.create({
  root: {
    gap: Spacing.two,
  },
  statusCaptured: {},
  statusEmpty: {},
  box: {
    borderRadius: Radii.md,
    overflow: 'hidden',
  },
  webviewContainer: {
    width: '100%',
  },
  canvas: {
    flex: 1,
  },
});
