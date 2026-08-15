import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { FormNotice } from '@/components/form-notice';
import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  acceptLast4Draft,
  ID_DOCUMENT_TYPE_OPTIONS,
  kycStatusLabel,
} from '@/lib/kyc';
import { todayInKolkata } from '@/lib/money';
import { pickStillImage } from '@/lib/pick-image';
import {
  saveKycCapture,
  uploadKycImage,
  verifyKyc,
  type CustomerKyc,
} from '@/services/kycService';
import type { IdDocumentType } from '@/types/database';

/**
 * DOC GATE (Expo SDK 57):
 * https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker/
 * package: expo-image-picker  last-modified: August 12, 2026
 *
 * Photo capture uses pickStillImage (v57 mediaTypes: ['images']).
 * Aadhaar disables the control so the operator never hits profiles_no_aadhaar_image_chk.
 */

const AADHAAR_PHOTO_REASON =
  'Aadhaar photos cannot be stored. An unmasked card image is the full number, and this shop has no UIDAI masking pipeline.';

type Props = {
  customer: CustomerKyc;
};

export function KycCaptureForm({ customer }: Props) {
  const colors = useTheme();
  const [documentType, setDocumentType] = useState<IdDocumentType | null>(customer.id_document_type);
  const [last4, setLast4] = useState(customer.id_document_last4 ?? '');
  const [last4Error, setLast4Error] = useState<string | null>(null);
  const [dateOfBirth, setDateOfBirth] = useState(customer.date_of_birth ?? '');
  const [guardianName, setGuardianName] = useState(customer.guardian_name ?? '');
  const [storedPath, setStoredPath] = useState<string | null>(customer.id_document_path);
  const [localPhotoUri, setLocalPhotoUri] = useState<string | null>(null);
  const [verifiedOn, setVerifiedOn] = useState<string | null>(customer.kyc_verified_on);
  const [isSaving, setIsSaving] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<string | null>(null);

  const photoLocked = documentType === 'aadhaar';

  const selectType = (next: IdDocumentType) => {
    setDocumentType(next);
    if (next === 'aadhaar') {
      setLocalPhotoUri(null);
    }
  };

  const onLast4Change = (next: string) => {
    const accepted = acceptLast4Draft(next);
    if (!accepted.ok) {
      setLast4Error(accepted.error);
      return;
    }
    setLast4Error(null);
    setLast4(accepted.value);
  };

  const pickPhoto = async (source: 'camera' | 'library') => {
    if (photoLocked) {
      return;
    }
    const uri = await pickStillImage(source);
    if (uri) {
      setLocalPhotoUri(uri);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setFormError(null);
    setFormNotice(null);
    try {
      let path = documentType === 'aadhaar' ? null : storedPath;
      if (localPhotoUri && documentType !== 'aadhaar') {
        path = await uploadKycImage(localPhotoUri, customer.id, documentType);
      }
      await saveKycCapture({
        customerId: customer.id,
        idDocumentType: documentType,
        idDocumentLast4: last4,
        dateOfBirth,
        guardianName,
        idDocumentPath: path,
      });
      setStoredPath(path);
      setLocalPhotoUri(null);
      setFormNotice('KYC saved.');
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleVerify = async () => {
    setIsVerifying(true);
    setFormError(null);
    setFormNotice(null);
    try {
      await verifyKyc(customer.id);
      setVerifiedOn(todayInKolkata());
      setFormNotice('KYC marked verified.');
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <View style={styles.form}>
      <ThemedText type="smallBold">{customer.full_name ?? 'Customer'}</ThemedText>
      <ThemedText type="small" testID="kyc-status">
        {kycStatusLabel(verifiedOn)}
      </ThemedText>
      <FormNotice error={formError} notice={formNotice} />

      <ThemedText type="smallBold">ID document</ThemedText>
      <View style={styles.chipRow}>
        {ID_DOCUMENT_TYPE_OPTIONS.map((option) => (
          <Pressable
            key={option.value}
            testID={`kyc-type-${option.value}`}
            accessibilityRole="button"
            onPress={() => selectType(option.value)}
            style={[
              styles.chip,
              {
                backgroundColor:
                  documentType === option.value ? colors.backgroundSelected : colors.elevated,
                borderColor: colors.border,
              },
            ]}>
            <ThemedText type="small">{option.label}</ThemedText>
          </Pressable>
        ))}
      </View>

      <Field
        testID="kyc-last4"
        label="Last 4 of ID"
        value={last4}
        onChangeText={onLast4Change}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder="ABCD"
        error={last4Error}
      />
      {!last4Error ? (
        <ThemedText type="small">Four characters only. Do not enter the full number.</ThemedText>
      ) : null}

      <Field
        testID="kyc-dob"
        label="Date of birth (YYYY-MM-DD)"
        value={dateOfBirth}
        onChangeText={setDateOfBirth}
        placeholder="1990-01-15"
      />

      <Field
        testID="kyc-guardian"
        label="Guardian name (optional)"
        value={guardianName}
        onChangeText={setGuardianName}
      />

      {photoLocked ? (
        <ThemedText type="small" testID="kyc-aadhaar-photo-reason">
          {AADHAAR_PHOTO_REASON}
        </ThemedText>
      ) : null}
      <View style={styles.photoRow}>
        <Button
          testID="kyc-photo-camera"
          label="Photograph ID"
          variant="secondary"
          disabled={photoLocked}
          onPress={() => void pickPhoto('camera')}
          style={styles.photoBtn}
        />
        <Button
          testID="kyc-photo-library"
          label="Choose photo"
          variant="secondary"
          disabled={photoLocked}
          onPress={() => void pickPhoto('library')}
          style={styles.photoBtn}
        />
      </View>
      {localPhotoUri && !photoLocked ? (
        <ThemedText type="small" testID="kyc-photo-pending">
          Photo ready to upload on save
        </ThemedText>
      ) : null}

      <Button testID="kyc-save" label="Save KYC" loading={isSaving} onPress={() => void handleSave()} />

      <Button
        testID="kyc-verify"
        label="Mark verified"
        variant="secondary"
        loading={isVerifying}
        onPress={() => void handleVerify()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: Spacing.two },
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
