import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import SignatureCanvas from 'react-native-signature-canvas';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatPaiseAsInr, todayInKolkata } from '@/lib/money';
import { extractReceiptData } from '@/services/ocrService';
import {
  calculateAssetValue,
  fetchLiveGoldRatePerGram,
  type GoldRateQuote,
} from '@/services/goldRateService';
import { createLoanWithCustomer } from '@/services/loanService';
import type { LoanFormData } from '@/types/database';

const emptyForm: LoanFormData = {
  serial_number: '',
  customer_name: '',
  phone_number: '',
  address: '',
  item_name: '',
  weight_grams: '',
  loan_amount_rupees: '',
  interest_percent_monthly: '3',
  disbursed_on: todayInKolkata(),
};

function FormField({
  label,
  value,
  onChangeText,
  keyboardType = 'default',
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  keyboardType?: 'default' | 'numeric' | 'phone-pad';
}) {
  const colors = useTheme();

  return (
    <View style={styles.field}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        style={[styles.input, { borderColor: colors.backgroundSelected, color: colors.text }]}
      />
    </View>
  );
}

export default function AdminScannerScreen() {
  const colors = useTheme();
  const router = useRouter();

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const signatureRef = useRef<ComponentRef<typeof SignatureCanvas> | null>(null);

  const [step, setStep] = useState<'camera' | 'review'>('camera');
  const [localPhotoUri, setLocalPhotoUri] = useState<string | null>(null);
  const [form, setForm] = useState<LoanFormData>(emptyForm);
  const [goldQuote, setGoldQuote] = useState<GoldRateQuote | null>(null);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const assetValuePaise = useMemo(() => {
    const weight = Number(form.weight_grams);
    if (!goldQuote || !weight) return 0;
    return calculateAssetValue(weight, goldQuote.pricePerGramPaise);
  }, [form.weight_grams, goldQuote]);

  const updateForm = useCallback((key: keyof LoanFormData, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  useEffect(() => {
    void fetchLiveGoldRatePerGram()
      .then(setGoldQuote)
      .catch((error: Error) => console.warn(error.message));
  }, []);

  const captureAndProcess = async () => {
    if (!cameraRef.current) return;

    setIsBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      if (!photo?.uri) {
        throw new Error('Camera did not return an image.');
      }

      setLocalPhotoUri(photo.uri);
      // OCR via Edge Function (Moonshot key server-side); upload deferred until save
      // so the object path can be namespaced by customer id.
      const extracted = await extractReceiptData(photo.uri);
      setForm({
        serial_number: extracted.serial_number,
        customer_name: extracted.customer_name,
        phone_number: extracted.phone_number,
        address: extracted.address,
        item_name: extracted.item_name,
        weight_grams: extracted.weight_grams ? String(extracted.weight_grams) : '',
        loan_amount_rupees: extracted.loan_amount ? String(extracted.loan_amount) : '',
        interest_percent_monthly: extracted.interest_rate ? String(extracted.interest_rate) : '3',
        disbursed_on: extracted.date || todayInKolkata(),
      });
      setStep('review');
    } catch (error) {
      Alert.alert('Scan failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsBusy(false);
    }
  };

  const handleSave = async () => {
    if (!localPhotoUri) {
      Alert.alert('Missing receipt', 'Capture a receipt image before saving.');
      return;
    }

    setIsBusy(true);
    try {
      const loanId = await createLoanWithCustomer(form, localPhotoUri, signatureDataUrl);
      Alert.alert('Saved', 'Girvi loan created successfully.', [
        { text: 'View loan', onPress: () => router.replace(`/(admin)/loan/${loanId}`) },
        { text: 'Dashboard', onPress: () => router.replace('/(admin)/dashboard') },
      ]);
    } catch (error) {
      Alert.alert('Save failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsBusy(false);
    }
  };

  if (!permission) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (!permission.granted) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText style={styles.centerText}>Camera permission is required to scan receipts.</ThemedText>
        <Pressable style={styles.primaryBtn} onPress={() => void requestPermission()}>
          <ThemedText type="smallBold">Grant permission</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  if (step === 'camera') {
    return (
      <ThemedView style={styles.container}>
        <CameraView ref={cameraRef} style={styles.camera} facing="back" />
        <SafeAreaView style={styles.cameraOverlay}>
          <ThemedText type="title" style={styles.overlayTitle}>
            Scan Girvi Receipt
          </ThemedText>
          <Pressable
            style={[styles.primaryBtn, { backgroundColor: colors.backgroundSelected }]}
            onPress={() => void captureAndProcess()}
            disabled={isBusy}>
            {isBusy ? <ActivityIndicator /> : <ThemedText type="smallBold">Capture & Extract</ThemedText>}
          </Pressable>
          <Pressable onPress={() => router.back()}>
            <ThemedText type="small">Cancel</ThemedText>
          </Pressable>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.reviewContent}>
        <ThemedText type="title">Review & Save</ThemedText>

        {localPhotoUri ? <Image source={{ uri: localPhotoUri }} style={styles.preview} contentFit="cover" /> : null}

        {goldQuote ? (
          <View style={[styles.goldCard, { backgroundColor: colors.backgroundElement }]}>
            <ThemedText type="smallBold">Live Gold Rate</ThemedText>
            <ThemedText type="small">
              {formatPaiseAsInr(goldQuote.pricePerGramPaise)} / gram ({goldQuote.source})
            </ThemedText>
            <ThemedText type="smallBold">Estimated Asset Value: {formatPaiseAsInr(assetValuePaise)}</ThemedText>
          </View>
        ) : null}

        <FormField label="Serial Number" value={form.serial_number} onChangeText={(v) => updateForm('serial_number', v)} />
        <FormField label="Customer Name" value={form.customer_name} onChangeText={(v) => updateForm('customer_name', v)} />
        <FormField
          label="Phone Number"
          value={form.phone_number}
          onChangeText={(v) => updateForm('phone_number', v)}
          keyboardType="phone-pad"
        />
        <FormField label="Address" value={form.address} onChangeText={(v) => updateForm('address', v)} />
        <FormField label="Item Name" value={form.item_name} onChangeText={(v) => updateForm('item_name', v)} />
        <FormField
          label="Weight (grams)"
          value={form.weight_grams}
          onChangeText={(v) => updateForm('weight_grams', v)}
          keyboardType="numeric"
        />
        <FormField
          label="Loan Amount (₹)"
          value={form.loan_amount_rupees}
          onChangeText={(v) => updateForm('loan_amount_rupees', v)}
          keyboardType="numeric"
        />
        <FormField
          label="Interest Rate (% per 30 days)"
          value={form.interest_percent_monthly}
          onChangeText={(v) => updateForm('interest_percent_monthly', v)}
          keyboardType="numeric"
        />
        <FormField
          label="Disbursed on (YYYY-MM-DD)"
          value={form.disbursed_on}
          onChangeText={(v) => updateForm('disbursed_on', v)}
        />

        <ThemedText type="smallBold">Customer Digital Signature</ThemedText>
        <View style={styles.signatureBox}>
          <SignatureCanvas
            ref={signatureRef}
            onOK={(sig) => setSignatureDataUrl(sig)}
            onEmpty={() => setSignatureDataUrl(null)}
            descriptionText="Sign above"
            clearText="Clear"
            confirmText="Save"
            webStyle={`.m-signature-pad { box-shadow: none; border: none; }`}
            style={styles.signatureCanvas}
          />
        </View>

        <Pressable
          style={[styles.primaryBtn, { backgroundColor: colors.backgroundSelected }]}
          onPress={() => void handleSave()}
          disabled={isBusy}>
          {isBusy ? <ActivityIndicator /> : <ThemedText type="smallBold">Save Girvi Loan</ThemedText>}
        </Pressable>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.four, gap: Spacing.three },
  centerText: { textAlign: 'center' },
  camera: { flex: 1 },
  cameraOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.four,
    gap: Spacing.two,
    alignItems: 'center',
  },
  overlayTitle: { color: '#fff', textShadowColor: '#000', textShadowRadius: 6 },
  reviewContent: { padding: Spacing.four, gap: Spacing.three },
  preview: { width: '100%', height: 200, borderRadius: 12 },
  goldCard: { borderRadius: 12, padding: Spacing.three, gap: Spacing.one },
  field: { gap: Spacing.one },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  signatureBox: { height: 220, borderRadius: 12, overflow: 'hidden' },
  signatureCanvas: { flex: 1 },
  primaryBtn: {
    borderRadius: 12,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
});
