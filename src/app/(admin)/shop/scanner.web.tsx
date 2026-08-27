/**
 * Web must not load screens/admin/scanner.tsx (expo-camera CameraView).
 * https://docs.expo.dev/router/advanced/platform-specific-modules/
 */
export { default } from '@/screens/admin/scanner.web';
