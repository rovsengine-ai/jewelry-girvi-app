import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
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
    } catch (error) {
      Alert.alert('Could not save KYC', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleVerify = async () => {
    setIsVerifying(true);
    try {
      await verifyKyc(customer.id);
      setVerifiedOn(todayInKolkata());
    } catch (error) {
      Alert.alert('Could not verify KYC', error instanceof Error ? error.message : 'Unknown error');
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
                  documentType === option.value ? colors.backgroundSelected : colors.backgroundElement,
              },
            ]}>
            <ThemedText type="small">{option.label}</ThemedText>
          </Pressable>
        ))}
      </View>

      <ThemedText type="smallBold">Last 4 of ID</ThemedText>
      <TextInput
        testID="kyc-last4"
        value={last4}
        onChangeText={onLast4Change}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder="ABCD"
        placeholderTextColor={colors.textSecondary}
        style={[styles.input, { borderColor: colors.backgroundSelected, color: colors.text }]}
      />
      {last4Error ? (
        <ThemedText type="small" testID="kyc-last4-error">
          {last4Error}
        </ThemedText>
      ) : (
        <ThemedText type="small">Four characters only. Do not enter the full number.</ThemedText>
      )}

      <ThemedText type="smallBold">Date of birth (YYYY-MM-DD)</ThemedText>
      <TextInput
        testID="kyc-dob"
        value={dateOfBirth}
        onChangeText={setDateOfBirth}
        placeholder="1990-01-15"
        placeholderTextColor={colors.textSecondary}
        style={[styles.input, { borderColor: colors.backgroundSelected, color: colors.text }]}
      />

      <ThemedText type="smallBold">Guardian name (optional)</ThemedText>
      <TextInput
        testID="kyc-guardian"
        value={guardianName}
        onChangeText={setGuardianName}
        placeholderTextColor={colors.textSecondary}
        style={[styles.input, { borderColor: colors.backgroundSelected, color: colors.text }]}
      />

      {photoLocked ? (
        <ThemedText type="small" testID="kyc-aadhaar-photo-reason">
          {AADHAAR_PHOTO_REASON}
        </ThemedText>
      ) : null}
      <View style={styles.photoRow}>
        <Pressable
          testID="kyc-photo-camera"
          accessibilityRole="button"
          accessibilityState={{ disabled: photoLocked }}
          disabled={photoLocked}
          onPress={() => void pickPhoto('camera')}
          style={[styles.photoBtn, { backgroundColor: colors.backgroundSelected }]}>
          <ThemedText type="smallBold">Photograph ID</ThemedText>
        </Pressable>
        <Pressable
          testID="kyc-photo-library"
          accessibilityRole="button"
          accessibilityState={{ disabled: photoLocked }}
          disabled={photoLocked}
          onPress={() => void pickPhoto('library')}
          style={[styles.photoBtn, { backgroundColor: colors.backgroundSelected }]}>
          <ThemedText type="smallBold">Choose photo</ThemedText>
        </Pressable>
      </View>
      {localPhotoUri && !photoLocked ? (
        <ThemedText type="small" testID="kyc-photo-pending">
          Photo ready to upload on save
        </ThemedText>
      ) : null}

      <Pressable
        testID="kyc-save"
        accessibilityRole="button"
        onPress={() => void handleSave()}
        disabled={isSaving}
        style={[styles.primaryBtn, { backgroundColor: colors.backgroundSelected }]}>
        {isSaving ? <ActivityIndicator /> : <ThemedText type="smallBold">Save KYC</ThemedText>}
      </Pressable>

      <Pressable
        testID="kyc-verify"
        accessibilityRole="button"
        onPress={() => void handleVerify()}
        disabled={isVerifying}
        style={[styles.primaryBtn, { backgroundColor: colors.backgroundElement }]}>
        {isVerifying ? <ActivityIndicator /> : <ThemedText type="smallBold">Mark verified</ThemedText>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: Spacing.two },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  chip: { borderRadius: 999, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  photoRow: { flexDirection: 'row', gap: Spacing.two },
  photoBtn: { flex: 1, borderRadius: 10, paddingVertical: Spacing.two, alignItems: 'center' },
  primaryBtn: { borderRadius: 10, paddingVertical: Spacing.two, alignItems: 'center' },
});
