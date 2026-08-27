/**
 * Path prefix so shop tabs are /shop/loans (not /loans).
 * Customer tabs stay at /loans — groups omit from the URL, so both cannot
 * share the same file name at the root.
 */
import { Slot } from 'expo-router';

export default function ShopPathLayout() {
  return <Slot />;
}
