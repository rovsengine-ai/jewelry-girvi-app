/**
 * Web scanner. Do not import expo-camera or react-native-webview here —
 * those packages have blanked the shop book when plus/scan pushed this route.
 * Camera: getUserMedia from a button tap.
 * https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker/
 */
import { useEffect, useReducer, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';

import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { FormNotice } from '@/components/form-notice';
import { GlassSurface } from '@/components/glass-surface';
import { ImagePreviewTap } from '@/components/image-lightbox';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radii, Spacing } from '@/constants/theme';
import { formatIsoDateInput } from '@/lib/format-iso-date-input';
import { newIdempotencyKey } from '@/lib/idempotency';
import { todayInKolkata } from '@/lib/money';
import { inferMetalFromItemName, isOcrExtractionPartial } from '@/lib/ocr-receipt-parse';
import { parseShopQr } from '@/lib/parse-shop-qr';
import { pickStillImage, PermissionDeniedError } from '@/lib/pick-image';
import { emptyScannerItem, scannerItemsReducer } from '@/lib/scanner-items';
import { ADMIN_LOANS_HREF } from '@/lib/shop-tab-access';
import { useLanguage } from '@/providers/language-provider';
import {
  createLoanWithCustomer,
  fetchOwnLoanIdByPublicToken,
  SerialExistsError,
  type CounterCustomerRole,
} from '@/services/loanService';
import { extractReceiptData, ocrErrorDisplayMessage } from '@/services/ocrService';
import type { LoanFormData } from '@/types/database';

type Step = 'choose' | 'capture' | 'review';
type CameraMode = 'ocr' | 'qr';

const emptyForm: LoanFormData = {
  serial_number: '',
  customer_name: '',
  phone_number: '',
  address: '',
  loan_amount_rupees: '',
  interest_percent_monthly: '3',
  disbursed_on: todayInKolkata(),
};

function WebLiveVideo({ stream }: { stream: MediaStream }) {
  const hostRef = useRef<View>(null);
  useEffect(() => {
    const node = hostRef.current as unknown as HTMLElement | null;
    if (!node) return;
    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.setAttribute('data-testid', 'web-live-video');
    video.style.width = '100%';
    video.style.minHeight = '240px';
    video.style.background = '#111';
    video.style.objectFit = 'cover';
    video.srcObject = stream;
    node.replaceChildren(video);
    return () => {
      video.srcObject = null;
      node.replaceChildren();
    };
  }, [stream]);
  return <View ref={hostRef} style={styles.liveHost} />;
}

export default function AdminScannerWebScreen() {
  const router = useRouter();
  const { intent } = useLocalSearchParams<{ intent?: string | string[] }>();
  const qrIntent = (Array.isArray(intent) ? intent[0] : intent) === 'qr';
  const { t } = useLanguage();

  const [step, setStep] = useState<Step>('choose');
  const [cameraMode, setCameraMode] = useState<CameraMode>(qrIntent ? 'qr' : 'ocr');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [localPhotoUri, setLocalPhotoUri] = useState<string | null>(null);
  const [form, setForm] = useState<LoanFormData>(emptyForm);
  const [items, dispatchItems] = useReducer(scannerItemsReducer, [emptyScannerItem('item-1')]);
  const [isBusy, setIsBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<string | null>(null);
  const [ocrPartial, setOcrPartial] = useState(false);
  const [savedLoanId, setSavedLoanId] = useState<string | null>(null);
  const [customerRole, setCustomerRole] = useState<CounterCustomerRole>('retail_customer');
  const idempotencyRef = useRef(newIdempotencyKey());

  useEffect(() => {
    return () => {
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [stream]);

  const stopStream = () => {
    stream?.getTracks().forEach((track) => track.stop());
    setStream(null);
  };

  const goCapture = (mode: CameraMode) => {
    setCameraMode(mode);
    setFormError(null);
    setFormNotice(null);
    setStep('capture');
  };

  const enableLiveCamera = async () => {
    setFormError(null);
    try {
      const next = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'user' } },
        audio: false,
      });
      setStream(next);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : t('loans.scanner.cameraMountFailed'),
      );
    }
  };

  const captureLiveFrame = async () => {
    const video = document.querySelector('[data-testid="web-live-video"]') as HTMLVideoElement | null;
    if (!video || video.readyState < 2) {
      setFormError(t('loans.scanner.cameraNoImage'));
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setFormError(t('loans.scanner.cameraNoImage'));
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const uri = canvas.toDataURL('image/jpeg', 0.85);
    stopStream();
    if (cameraMode === 'qr') {
      await openQrFromUri(uri);
      return;
    }
    await processReceiptUri(uri);
  };

  const processReceiptUri = async (uri: string) => {
    setLocalPhotoUri(uri);
    setStep('review');
    setIsBusy(true);
    setFormError(null);
    setFormNotice(t('loans.scanner.ocrWorking'));
    try {
      const { extraction, preparedUri } = await extractReceiptData(uri);
      setFormNotice(null);
      setLocalPhotoUri(preparedUri);
      setForm({
        serial_number: extraction.serial_number,
        customer_name: extraction.customer_name,
        phone_number: extraction.phone_number,
        address: extraction.address,
        loan_amount_rupees: extraction.loan_amount ? String(extraction.loan_amount) : '',
        interest_percent_monthly: extraction.interest_rate ? String(extraction.interest_rate) : '3',
        disbursed_on: extraction.date || todayInKolkata(),
      });
      dispatchItems({
        type: 'seedFromOcr',
        ornamentType: extraction.item_name,
        grossGrams: extraction.weight_grams ? String(extraction.weight_grams) : '',
        metal: inferMetalFromItemName(extraction.item_name),
      });
      setOcrPartial(isOcrExtractionPartial(extraction));
    } catch (error) {
      setFormNotice(null);
      setFormError(ocrErrorDisplayMessage(error, t));
    } finally {
      setIsBusy(false);
    }
  };

  const openQrFromUri = async (uri: string) => {
    setIsBusy(true);
    setFormError(null);
    setFormNotice(t('loans.scanner.qrWorking'));
    try {
      const camera = await import('expo-camera');
      const hits = await camera.scanFromURLAsync(uri, ['qr']);
      const data = hits[0]?.data?.trim();
      if (!data) {
        setFormNotice(null);
        setFormError(t('loans.scanner.qrNotRecognized'));
        return;
      }
      const payload = parseShopQr(data);
      if (!payload || payload.kind !== 'loan') {
        setFormNotice(null);
        setFormError(t('loans.scanner.qrNotRecognized'));
        return;
      }
      const loanId = await fetchOwnLoanIdByPublicToken(payload.token);
      if (!loanId) {
        setFormNotice(null);
        setFormError(t('loans.scanner.qrLoanNotFound'));
        return;
      }
      router.replace(`/(admin)/loan/${loanId}`);
    } catch (error) {
      setFormNotice(null);
      setFormError(error instanceof Error ? error.message : t('errors.unknown'));
    } finally {
      setIsBusy(false);
    }
  };

  const pickAndProcess = async (source: 'camera' | 'library') => {
    setFormError(null);
    try {
      const uri = await pickStillImage(source);
      if (!uri) return;
      if (cameraMode === 'qr') {
        await openQrFromUri(uri);
        return;
      }
      await processReceiptUri(uri);
    } catch (error) {
      if (error instanceof PermissionDeniedError) {
        setFormError(
          error.kind === 'library'
            ? t('loans.scanner.galleryPermission')
            : t('loans.scanner.cameraNeededBody'),
        );
        return;
      }
      setFormError(ocrErrorDisplayMessage(error, t));
    }
  };

  const startManual = () => {
    stopStream();
    setForm({ ...emptyForm, disbursed_on: todayInKolkata() });
    dispatchItems({ type: 'reset' });
    setLocalPhotoUri(null);
    setOcrPartial(false);
    setFormError(null);
    setFormNotice(null);
    setSavedLoanId(null);
    setStep('review');
  };

  const handleSave = async () => {
    if (!localPhotoUri && step === 'review') {
      // manual is allowed without a photo
    }
    setIsBusy(true);
    setFormError(null);
    try {
      const outcome = await createLoanWithCustomer(
        form,
        items,
        localPhotoUri,
        null,
        null,
        customerRole,
        { idempotencyKey: idempotencyRef.current },
      );
      idempotencyRef.current = newIdempotencyKey();
      setSavedLoanId(outcome.loanId);
      setFormNotice(t('loans.scanner.createdSuccess'));
    } catch (error) {
      if (error instanceof SerialExistsError) {
        setFormError(t('loans.scanner.serialExists', { serial: error.serialNumber }));
        return;
      }
      setFormError(error instanceof Error ? error.message : t('errors.unknown'));
    } finally {
      setIsBusy(false);
    }
  };

  const title =
    step === 'choose'
      ? t('loans.scanner.choiceTitle')
      : cameraMode === 'qr'
        ? t('loans.scanner.scanReceiptQr')
        : t('loans.scanner.cameraTitle');

  return (
    <ThemedView style={styles.container} type="surfaceSunken">
      <ScreenHeader
        showBack
        title={title}
        onBack={() => {
          if (step === 'choose') {
            router.back();
            return;
          }
          stopStream();
          setStep('choose');
        }}
      />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <GlassSurface androidBlur intensity="strong" style={styles.card}>
          {step === 'choose' ? (
            <>
              <ThemedText type="bodyLarge">{t('loans.scanner.choiceSubtitle')}</ThemedText>
              <Button
                testID="scanner-choose-scan"
                label={t('loans.scanner.scanReceipt')}
                onPress={() => goCapture('ocr')}
              />
              <Button
                testID="scanner-choose-qr"
                label={t('loans.scanner.scanReceiptQr')}
                variant="secondary"
                onPress={() => goCapture('qr')}
              />
              <Button
                testID="scanner-choose-manual"
                label={t('loans.scanner.enterManually')}
                variant="secondary"
                onPress={startManual}
              />
              <Button label={t('common.cancel')} variant="secondary" onPress={() => router.back()} />
            </>
          ) : null}

          {step === 'capture' ? (
            <>
              <ThemedText type="small" themeColor="textSecondary">
                {t('loans.scanner.webCameraLead')}
              </ThemedText>
              <FormNotice error={formError} notice={formNotice} />
              {stream ? <WebLiveVideo stream={stream} /> : null}
              {!stream ? (
                <Button
                  testID="scanner-enable-camera"
                  label={t('loans.scanner.enableLiveCamera')}
                  onPress={() => void enableLiveCamera()}
                />
              ) : (
                <Button
                  testID="scanner-capture"
                  label={
                    cameraMode === 'qr'
                      ? t('loans.scanner.scanReceiptQr')
                      : t('loans.scanner.captureExtract')
                  }
                  loading={isBusy}
                  onPress={() => void captureLiveFrame()}
                />
              )}
              <Button
                testID="scanner-gallery"
                label={t('loans.scanner.pickFromGallery')}
                variant="secondary"
                loading={isBusy}
                onPress={() => void pickAndProcess('library')}
              />
              <Button
                testID="scanner-phone-camera"
                label={t('loans.scanner.usePhoneCamera')}
                variant="secondary"
                loading={isBusy}
                onPress={() => void pickAndProcess('camera')}
              />
              <Button
                label={t('common.cancel')}
                variant="secondary"
                onPress={() => {
                  stopStream();
                  setStep('choose');
                }}
              />
            </>
          ) : null}

          {step === 'review' ? (
            <>
              <FormNotice
                info={ocrPartial ? t('loans.scanner.ocrPartialNotice') : null}
                error={formError}
                notice={formNotice}
              />
              {localPhotoUri ? (
                <ImagePreviewTap uri={localPhotoUri} testID="receipt-photo-preview">
                  <Image source={{ uri: localPhotoUri }} style={styles.preview} contentFit="cover" />
                </ImagePreviewTap>
              ) : null}
              <Field
                label={t('loans.scanner.serialNumber')}
                value={form.serial_number}
                onChangeText={(serial_number) => setForm((prev) => ({ ...prev, serial_number }))}
              />
              <Field
                label={t('loans.scanner.customerName')}
                value={form.customer_name}
                onChangeText={(customer_name) => setForm((prev) => ({ ...prev, customer_name }))}
              />
              <Field
                label={t('loans.scanner.phoneNumber')}
                value={form.phone_number}
                onChangeText={(phone_number) => setForm((prev) => ({ ...prev, phone_number }))}
              />
              <Field
                label={t('loans.scanner.loanAmount')}
                value={form.loan_amount_rupees}
                onChangeText={(loan_amount_rupees) =>
                  setForm((prev) => ({ ...prev, loan_amount_rupees }))
                }
                keyboardType="numeric"
              />
              <Field
                label={t('loans.scanner.disbursedOn')}
                value={form.disbursed_on}
                onChangeText={(disbursed_on) =>
                  setForm((prev) => ({ ...prev, disbursed_on: formatIsoDateInput(disbursed_on) }))
                }
              />
              {savedLoanId ? (
                <Button
                  label={t('loans.scanner.goToLoans')}
                  onPress={() => router.replace(ADMIN_LOANS_HREF)}
                />
              ) : (
                <Button
                  label={t('loans.scanner.saveGirviLoan')}
                  loading={isBusy}
                  requiresNetwork
                  onPress={() => void handleSave()}
                />
              )}
            </>
          ) : null}
        </GlassSurface>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: '100%' as unknown as number },
  body: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: Spacing.four,
  },
  card: {
    borderRadius: Radii.md,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  liveHost: {
    minHeight: 240,
    width: '100%',
    backgroundColor: '#111111',
    overflow: 'hidden',
    borderRadius: Radii.sm,
  },
  preview: { width: '100%', aspectRatio: 4 / 3, borderRadius: Radii.sm },
});
