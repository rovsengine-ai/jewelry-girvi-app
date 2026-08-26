/**
 * Full-screen local/remote image preview with pinch/scroll zoom.
 * https://docs.expo.dev/versions/v57.0.0/sdk/image/
 */
import { Image } from 'expo-image';
import { useState, type ReactNode } from 'react';
import {
  Dimensions,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useLanguage } from '@/providers/language-provider';

type Props = {
  uri: string | null | undefined;
  visible: boolean;
  onClose: () => void;
};

export function ImageLightbox({ uri, visible, onClose }: Props) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { width, height } = Dimensions.get('window');

  if (!uri) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent>
      <View style={[styles.backdrop, { backgroundColor: 'rgba(0,0,0,0.92)' }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={onClose}
          style={[styles.closeHit, { top: insets.top + Spacing.two, right: Spacing.three }]}>
          <ThemedText type="label" style={{ color: colors.onChrome }}>
            {t('common.close')}
          </ThemedText>
        </Pressable>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { minHeight: height }]}
          maximumZoomScale={Platform.OS === 'ios' ? 4 : 1}
          minimumZoomScale={1}
          centerContent
          bouncesZoom>
          <Image
            source={{ uri }}
            style={{ width: width - Spacing.four * 2, height: height * 0.75 }}
            contentFit="contain"
          />
        </ScrollView>
      </View>
    </Modal>
  );
}

/** Tap-to-preview wrapper; children render the thumbnail. */
export function ImagePreviewTap({
  uri,
  children,
  testID,
}: {
  uri: string | null | undefined;
  children: ReactNode;
  testID?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!uri) return <>{children}</>;

  return (
    <>
      <Pressable
        testID={testID}
        accessibilityRole="imagebutton"
        onPress={() => setOpen(true)}>
        {children}
      </Pressable>
      <ImageLightbox uri={uri} visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  closeHit: {
    position: 'absolute',
    zIndex: 2,
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
  },
});
