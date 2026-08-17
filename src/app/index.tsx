import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { routeForRole, useAuth } from '@/providers/auth-provider';

export default function Index() {
  const { session, profile, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  return <Redirect href={routeForRole(profile?.role)} />;
}
