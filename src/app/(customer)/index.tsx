import { Redirect } from 'expo-router';

import { CUSTOMER_LOANS_HREF } from '@/lib/shop-tab-access';

export default function CustomerIndex() {
  return <Redirect href={CUSTOMER_LOANS_HREF} />;
}
