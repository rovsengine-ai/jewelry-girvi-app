import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { acceptLast4Draft, ID_DOCUMENT_TYPE_OPTIONS } from '@/lib/kyc';
import type { KycDraft } from '@/lib/kyc-draft';
import { pickStillImage } from '@/lib/pick-image';
import { useLanguage } from '@/providers/language-provider';

type Props = {
  value: KycDraft;
  onChange: (next: KycDraft) => void;
  testIdPrefix?: string;
};

export function KycCaptureFields({ value, onChange, testIdPrefix = 'kyc' }: Props) {
  const colors = useTheme();
  const { t } = useLanguage();
  const [last4Error, setLast4Error] = useState<string | null>(null);

  const photoLocked = value.idDocumentType === 'aadhaar';

  const patch = (partial: Partial<KycDraft>) => {
    onChange({ ...value, ...partial });
  };

  const selectType = (next: KycDraft['idDocumentType']) => {
    if (next === 'aadhaar') {
      patch({ idDocumentType: next, localPhotoUri: null });
      return;
    }
    patch({ idDocumentType: next });
  };

  const onLast4Change = (next: string) => {
    const accepted = acceptLast4Draft(next);
    if (!accepted.ok) {
      setLast4Error(t('kyc.last4TooLong'));
      return;
    }
    setLast4Error(null);
    patch({ idDocumentLast4: accepted.value });
  };

  const pickPhoto = async (source: 'camera' | 'library') => {
    if (photoLocked) {
      return;
    }
    const uri = await pickStillImage(source);
    if (uri) {
      patch({ localPhotoUri: uri });
    }
  };

  const pickCustomerPhoto = async (source: 'camera' | 'library') => {
    const uri = await pickStillImage(source);
    if (uri) {
      patch({ localCustomerPhotoUri: uri });
    }
  };

  return (
    <View style={styles.root}>
      <ThemedText type="smallBold">{t('kyc.customerPhoto')}</ThemedText>
      <View style={styles.photoRow}>
        <Button
          testID={`${testIdPrefix}-customer-photo-camera`}
          label={t('kyc.photographCustomer')}
          variant="secondary"
          onPress={() => void pickCustomerPhoto('camera')}
          style={styles.photoBtn}
        />
        <Button
          testID={`${testIdPrefix}-customer-photo-library`}
          label={t('kyc.chooseCustomerPhoto')}
          variant="secondary"
          onPress={() => void pickCustomerPhoto('library')}
          style={styles.photoBtn}
        />
      </View>
      {value.localCustomerPhotoUri ? (
        <ThemedText type="small" testID={`${testIdPrefix}-customer-photo-pending`}>
          {t('kyc.customerPhotoPending')}
        </ThemedText>
      ) : null}

      <ThemedText type="smallBold">{t('kyc.idDocument')}</ThemedText>
      <View style={styles.chipRow}>
        {ID_DOCUMENT_TYPE_OPTIONS.map((option) => (
          <PressableScale
            key={option.value}
            testID={`${testIdPrefix}-type-${option.value}`}
            accessibilityRole="button"
            onPress={() => selectType(option.value)}
            style={[
              styles.chip,
              {
                backgroundColor:
                  value.idDocumentType === option.value
                    ? colors.backgroundSelected
                    : colors.elevated,
                borderColor: colors.border,
              },
            ]}>
            <ThemedText type="small">{t(`kyc.idType.${option.value}`)}</ThemedText>
          </PressableScale>
        ))}
      </View>

      <Field
        testID={`${testIdPrefix}-last4`}
        label={t('kyc.last4')}
        value={value.idDocumentLast4}
        onChangeText={onLast4Change}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder={t('kyc.last4Placeholder')}
        error={last4Error}
      />
      {!last4Error ? <ThemedText type="small">{t('kyc.last4Hint')}</ThemedText> : null}

      <Field
        testID={`${testIdPrefix}-dob`}
        label={t('kyc.dob')}
        value={value.dateOfBirth}
        onChangeText={(dateOfBirth) => patch({ dateOfBirth })}
        placeholder={t('kyc.dobPlaceholder')}
      />

      <Field
        testID={`${testIdPrefix}-guardian`}
        label={t('kyc.guardian')}
        value={value.guardianName}
        onChangeText={(guardianName) => patch({ guardianName })}
      />

      {photoLocked ? (
        <ThemedText type="small" testID={`${testIdPrefix}-aadhaar-photo-reason`}>
          {t('kyc.aadhaarPhotoReason')}
        </ThemedText>
      ) : null}
      <View style={styles.photoRow}>
        <Button
          testID={`${testIdPrefix}-photo-camera`}
          label={t('kyc.photographId')}
          variant="secondary"
          disabled={photoLocked}
          onPress={() => void pickPhoto('camera')}
          style={styles.photoBtn}
        />
        <Button
          testID={`${testIdPrefix}-photo-library`}
          label={t('kyc.choosePhoto')}
          variant="secondary"
          disabled={photoLocked}
          onPress={() => void pickPhoto('library')}
          style={styles.photoBtn}
        />
      </View>
      {value.localPhotoUri && !photoLocked ? (
        <ThemedText type="small" testID={`${testIdPrefix}-photo-pending`}>
          {t('kyc.photoPending')}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: Spacing.two },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  chip: {
    minHeight: MinTouchTarget,
    borderRadius: Radii.pill,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    justifyContent: 'center',
  },
  photoRow: { flexDirection: 'row', gap: Spacing.two },
  photoBtn: { flex: 1 },
});
