/**
 * Opaque-token QR for native + web.
 * Library: react-native-qrcode-svg + react-native-svg (Expo SDK 57 web-capable).
 * https://docs.expo.dev/versions/v57.0.0/sdk/svg/
 */
import { View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { useTheme } from '@/hooks/use-theme';

type TokenQrProps = {
  /** Full URL whose only secret payload is an opaque token. */
  value: string;
  size: number;
  testID?: string;
};

export function TokenQr({ value, size, testID }: TokenQrProps) {
  const colors = useTheme();
  return (
    <View testID={testID} accessibilityRole="image">
      <QRCode value={value} size={size} color={colors.text} backgroundColor={colors.elevated} />
    </View>
  );
}
