import { Redirect } from 'expo-router';

import { ADMIN_LOANS_HREF } from '@/lib/shop-tab-access';

export default function AdminIndex() {
  return <Redirect href={ADMIN_LOANS_HREF} />;
}
