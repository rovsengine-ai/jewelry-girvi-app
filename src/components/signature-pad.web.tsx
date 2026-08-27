/**
 * Browser signature pad. react-native-signature-canvas uses a WebView that
 * does not ship on web, so this draws on a real <canvas> owned by React.
 * Do not attach the canvas with replaceChildren: a re-render of the RN View
 * would discard the DOM node and the ink would vanish.
 */
import {
  createElement,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
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

function strokeStyle(ctx: CanvasRenderingContext2D, dpr: number): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.strokeStyle = '#1a120c';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
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
    const wrapRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const drawing = useRef(false);
    const hasInkRef = useRef(false);
    const [hasInk, setHasInk] = useState(false);
    const onDrawingChangeRef = useRef(onDrawingChange);
    onDrawingChangeRef.current = onDrawingChange;
    const scrollRefStored = useRef(scrollRef);
    scrollRefStored.current = scrollRef;

    useLayoutEffect(() => {
      const wrap = wrapRef.current;
      const canvas = canvasRef.current;
      if (!wrap || !canvas || typeof window === 'undefined') return;

      const applySize = () => {
        const cssW = Math.max(wrap.clientWidth, 280);
        const cssH = height;
        const dpr = window.devicePixelRatio || 1;
        const nextW = Math.max(1, Math.floor(cssW * dpr));
        const nextH = Math.max(1, Math.floor(cssH * dpr));
        if (canvas.width === nextW && canvas.height === nextH) {
          return;
        }

        let backup: HTMLCanvasElement | null = null;
        if (hasInkRef.current && canvas.width > 0 && canvas.height > 0) {
          backup = document.createElement('canvas');
          backup.width = canvas.width;
          backup.height = canvas.height;
          backup.getContext('2d')?.drawImage(canvas, 0, 0);
        }

        canvas.width = nextW;
        canvas.height = nextH;
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        strokeStyle(ctx, dpr);
        if (backup) {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.drawImage(backup, 0, 0, nextW, nextH);
          strokeStyle(ctx, dpr);
        }
      };

      applySize();
      const observer = new ResizeObserver(applySize);
      observer.observe(wrap);
      return () => observer.disconnect();
    }, [height]);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const point = (event: PointerEvent) => {
        const rect = canvas.getBoundingClientRect();
        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
      };

      const onDown = (event: PointerEvent) => {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        event.preventDefault();
        drawing.current = true;
        setParentScrollEnabled(scrollRefStored.current, false);
        onDrawingChangeRef.current?.(true);
        canvas.setPointerCapture(event.pointerId);
        const p = point(event);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
      };
      const onMove = (event: PointerEvent) => {
        if (!drawing.current) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        event.preventDefault();
        const p = point(event);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        if (!hasInkRef.current) {
          hasInkRef.current = true;
          setHasInk(true);
        }
      };
      const onUp = () => {
        drawing.current = false;
        setParentScrollEnabled(scrollRefStored.current, true);
        onDrawingChangeRef.current?.(false);
      };

      canvas.addEventListener('pointerdown', onDown, { passive: false });
      canvas.addEventListener('pointermove', onMove, { passive: false });
      canvas.addEventListener('pointerup', onUp);
      canvas.addEventListener('pointercancel', onUp);

      return () => {
        canvas.removeEventListener('pointerdown', onDown);
        canvas.removeEventListener('pointermove', onMove);
        canvas.removeEventListener('pointerup', onUp);
        canvas.removeEventListener('pointercancel', onUp);
      };
    }, []);

    useImperativeHandle(ref, () => ({
      readSignature: async () => {
        const canvas = canvasRef.current;
        if (!canvas || !hasInkRef.current) return null;
        return canvas.toDataURL('image/png');
      },
    }));

    const clearPad = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
      }
      hasInkRef.current = false;
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
        {createElement(
          'div',
          {
            ref: wrapRef,
            style: {
              width: '100%',
              height,
              borderRadius: Radii.md,
              overflow: 'hidden',
              touchAction: 'none',
            },
          },
          createElement('canvas', {
            ref: canvasRef,
            'data-testid': `${testID}-canvas`,
            style: {
              display: 'block',
              width: '100%',
              height: '100%',
              touchAction: 'none',
              background: '#f7f4ef',
            },
          }),
        )}
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
});
