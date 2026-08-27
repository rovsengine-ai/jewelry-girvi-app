import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { FormNotice } from '@/components/form-notice';
import { KycCaptureFields } from '@/components/kyc-capture-fields';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { kycStatusLabel } from '@/lib/kyc';
import { emptyKycDraft } from '@/lib/kyc-draft';
import { todayInKolkata } from '@/lib/money';
import { useLanguage } from '@/providers/language-provider';
import {
  saveKycCapture,
  uploadCustomerPhoto,
  uploadKycImage,
  verifyKyc,
  type CustomerKyc,
} from '@/services/kycService';

/**
 * Full KYC screen: capture fields plus save / owner verify actions.
 * Scanner review uses {@link KycCaptureFields} directly without verify.
 */

type Props = {
  customer: CustomerKyc;
};

export function KycCaptureForm({ customer }: Props) {
  const { t, language } = useLanguage();
  const [kycDraft, setKycDraft] = useState(() => ({
    ...emptyKycDraft(),
    idDocumentType: customer.id_document_type,
    idDocumentLast4: customer.id_document_last4 ?? '',
    dateOfBirth: customer.date_of_birth ?? '',
    guardianName: customer.guardian_name ?? '',
  }));
  const [storedPath, setStoredPath] = useState<string | null>(customer.id_document_path);
  const [storedPhotoPath, setStoredPhotoPath] = useState<string | null>(customer.photo_path);
  const [verifiedOn, setVerifiedOn] = useState<string | null>(customer.kyc_verified_on);
  const [isSaving, setIsSaving] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<string | null>(null);

  const handleSave = async () => {
    setIsSaving(true);
    setFormError(null);
    setFormNotice(null);
    try {
      let path = kycDraft.idDocumentType === 'aadhaar' ? null : storedPath;
      if (kycDraft.localPhotoUri && kycDraft.idDocumentType !== 'aadhaar') {
        path = await uploadKycImage(
          kycDraft.localPhotoUri,
          customer.id,
          kycDraft.idDocumentType,
        );
      }
      let photoPath: string | null | undefined;
      if (kycDraft.localCustomerPhotoUri) {
        photoPath = await uploadCustomerPhoto(kycDraft.localCustomerPhotoUri, customer.id);
      }
      await saveKycCapture({
        customerId: customer.id,
        idDocumentType: kycDraft.idDocumentType,
        idDocumentLast4: kycDraft.idDocumentLast4,
        dateOfBirth: kycDraft.dateOfBirth,
        guardianName: kycDraft.guardianName,
        idDocumentPath: path,
        photoPath,
      });
      setStoredPath(path);
      setStoredPhotoPath(photoPath ?? storedPhotoPath);
      setKycDraft((prev) => ({ ...prev, localPhotoUri: null, localCustomerPhotoUri: null }));
      setFormNotice(t('kyc.saved'));
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t('errors.unknown'));
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
      setFormNotice(t('kyc.markedVerified'));
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t('errors.unknown'));
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <View style={styles.form}>
      <ThemedText type="smallBold">{customer.full_name ?? t('common.customer')}</ThemedText>
      <ThemedText type="small" testID="kyc-status">
        {kycStatusLabel(verifiedOn, language)}
      </ThemedText>
      <FormNotice error={formError} notice={formNotice} />

      <KycCaptureFields value={kycDraft} onChange={setKycDraft} testIdPrefix="kyc" />

      <Button
        testID="kyc-save"
        label={t('kyc.save')}
        loading={isSaving}
        requiresNetwork
        onPress={() => void handleSave()}
      />

      <Button
        testID="kyc-verify"
        label={t('kyc.markVerified')}
        variant="secondary"
        loading={isVerifying}
        requiresNetwork
        onPress={() => void handleVerify()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: Spacing.two },
});
