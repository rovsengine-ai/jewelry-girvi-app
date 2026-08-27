/**
 * Browser signature pad. react-native-signature-canvas uses a WebView that
 * does not ship on web, so this draws on a real <canvas>.
 * Same SignaturePadRef contract as signature-pad.tsx.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, View, type ViewStyle, type ScrollView } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Radii, Spacing } from '@/constants/theme';
import { useLanguage } from '@/providers/language-provider';

export type SignaturePadRef = {
  readSignature: () => Promise<string | null>;
};

export type SignaturePadProps = {
  height: number;
  descriptionText?: string;
  autoClear?: boolean;
  scrollRef?: { current: ScrollView | null };
  onDrawingChange?: (active: boolean) => void;
  testID?: string;
  style?: ViewStyle;
};

function setParentScrollEnabled(
  scrollRef: { current: ScrollView | null } | undefined,
  enabled: boolean,
) {
  scrollRef?.current?.setNativeProps({ scrollEnabled: enabled });
}

export const SignaturePad = forwardRef<SignaturePadRef, SignaturePadProps>(
  function SignaturePadWeb(
    {
      height,
      descriptionText,
      scrollRef,
      onDrawingChange,
      testID = 'signature-pad',
      style,
    },
    ref,
  ) {
    const { t } = useLanguage();
    const hostRef = useRef<View>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const drawing = useRef(false);
    const [hasInk, setHasInk] = useState(false);

    useEffect(() => {
      const node = hostRef.current as unknown as HTMLElement | null;
      if (!node || typeof document === 'undefined') return;

      const canvas = document.createElement('canvas');
      canvas.setAttribute('data-testid', `${testID}-canvas`);
      canvas.style.width = '100%';
      canvas.style.height = `${height}px`;
      canvas.style.display = 'block';
      canvas.style.touchAction = 'none';
      canvas.style.background = '#f7f4ef';
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(node.clientWidth, 280);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
        ctx.strokeStyle = '#1a120c';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }
      node.replaceChildren(canvas);
      canvasRef.current = canvas;

      const point = (event: PointerEvent) => {
        const rect = canvas.getBoundingClientRect();
        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
      };

      const onDown = (event: PointerEvent) => {
        if (!ctx) return;
        drawing.current = true;
        setParentScrollEnabled(scrollRef, false);
        onDrawingChange?.(true);
        canvas.setPointerCapture(event.pointerId);
        const p = point(event);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
      };
      const onMove = (event: PointerEvent) => {
        if (!drawing.current || !ctx) return;
        const p = point(event);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        setHasInk(true);
      };
      const onUp = () => {
        drawing.current = false;
        setParentScrollEnabled(scrollRef, true);
        onDrawingChange?.(false);
      };

      canvas.addEventListener('pointerdown', onDown);
      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerup', onUp);
      canvas.addEventListener('pointercancel', onUp);

      return () => {
        canvas.removeEventListener('pointerdown', onDown);
        canvas.removeEventListener('pointermove', onMove);
        canvas.removeEventListener('pointerup', onUp);
        canvas.removeEventListener('pointercancel', onUp);
        canvasRef.current = null;
        node.replaceChildren();
      };
    }, [height, onDrawingChange, scrollRef, testID]);

    useImperativeHandle(ref, () => ({
      readSignature: async () => {
        const canvas = canvasRef.current;
        if (!canvas || !hasInk) return null;
        return canvas.toDataURL('image/png');
      },
    }));

    const clearPad = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      setHasInk(false);
    };

    return (
      <View style={[styles.root, style]} testID={testID}>
        {descriptionText ? (
          <ThemedText type="small" themeColor="textSecondary">
            {descriptionText}
          </ThemedText>
        ) : null}
        <ThemedText
          type="small"
          style={hasInk ? styles.statusCaptured : styles.statusEmpty}
          testID={`${testID}-status`}>
          {hasInk ? t('signaturePad.captured') : t('signaturePad.notSignedYet')}
        </ThemedText>
        <View ref={hostRef} style={[styles.box, { height }]} />
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
    width: '100%',
  },
});
