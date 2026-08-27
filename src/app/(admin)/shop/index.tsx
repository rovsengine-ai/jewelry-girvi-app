import { Redirect } from 'expo-router';

import { ADMIN_LOANS_HREF } from '@/lib/shop-tab-access';

export default function ShopIndex() {
  return <Redirect href={ADMIN_LOANS_HREF} />;
}
