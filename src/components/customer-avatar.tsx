import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { AvatarMonogram } from '@/components/avatar-monogram';
import { Radii, Sizes } from '@/constants/theme';

type Props = {
  name: string | null | undefined;
  photoUrl?: string | null;
  testID?: string;
};

export function CustomerAvatar({ name, photoUrl, testID }: Props) {
  if (photoUrl) {
    return (
      <View
        testID={testID}
        accessibilityRole="image"
        style={styles.circle}>
        <Image
          source={{ uri: photoUrl }}
          style={styles.image}
          contentFit="cover"
          accessibilityLabel={name?.trim() ?? undefined}
        />
      </View>
    );
  }

  return <AvatarMonogram name={name} testID={testID} />;
}

const styles = StyleSheet.create({
  circle: {
    width: Sizes.avatar,
    height: Sizes.avatar,
    borderRadius: Radii.pill,
    overflow: 'hidden',
  },
  image: {
    width: Sizes.avatar,
    height: Sizes.avatar,
  },
});
