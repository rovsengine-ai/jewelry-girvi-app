import { useCallback, useReducer, useRef, useState, type ComponentRef } from 'react';
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
import { todayInKolkata } from '@/lib/money';
import {
  emptyScannerItem,
  scannerItemsReducer,
  type PledgeMetal,
  type ScannerItemDraft,
} from '@/lib/scanner-items';
import { gramsInputToMg } from '@/lib/weight';
import {
  attachItemPhotos,
  createLoanWithCustomer,
  LoanPhotosIncompleteError,
} from '@/services/loanService';
import { extractReceiptData } from '@/services/ocrService';
import type { LoanFormData } from '@/types/database';

const GOLD_PURITY_OPTIONS: Array<{ label: string; value: number | null }> = [
  { label: 'Not assessed', value: null },
  { label: '24K', value: 24 },
  { label: '22K', value: 22 },
  { label: '18K', value: 18 },
  { label: '14K', value: 14 },
  { label: '10K', value: 10 },
];

const emptyForm: LoanFormData = {
  serial_number: '',
  customer_name: '',
  phone_number: '',
  address: '',
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

function ChoiceChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? colors.backgroundSelected : colors.backgroundElement,
        },
      ]}>
      <ThemedText type="small">{label}</ThemedText>
    </Pressable>
  );
}

function PledgeItemCard({
  item,
  index,
  canRemove,
  onPatch,
  onRemove,
}: {
  item: ScannerItemDraft;
  index: number;
  canRemove: boolean;
  onPatch: (patch: Partial<Omit<ScannerItemDraft, 'key'>>) => void;
  onRemove: () => void;
}) {
  const colors = useTheme();

  return (
    <View style={[styles.itemCard, { backgroundColor: colors.backgroundElement }]}>
      <View style={styles.itemHeader}>
        <ThemedText type="smallBold">Item {index + 1}</ThemedText>
        {canRemove ? (
          <Pressable onPress={onRemove}>
            <ThemedText type="small">Remove</ThemedText>
          </Pressable>
        ) : null}
      </View>

      <ThemedText type="small">Metal (required)</ThemedText>
      <View style={styles.chipRow}>
        {(['gold', 'silver'] as const).map((metal: PledgeMetal) => (
          <ChoiceChip
            key={metal}
            label={metal === 'gold' ? 'Gold' : 'Silver'}
            selected={item.metal === metal}
            onPress={() => onPatch({ metal })}
          />
        ))}
      </View>

      <FormField
        label="Ornament type"
        value={item.ornament_type}
        onChangeText={(ornament_type) => onPatch({ ornament_type })}
      />
      <FormField
        label="Description"
        value={item.description}
        onChangeText={(description) => onPatch({ description })}
      />
      <FormField
        label="Gross weight (grams)"
        value={item.gross_grams}
        onChangeText={(gross_grams) => onPatch({ gross_grams })}
        keyboardType="numeric"
      />
      <FormField
        label="Stone deduction (grams)"
        value={item.stone_grams}
        onChangeText={(stone_grams) => onPatch({ stone_grams })}
        keyboardType="numeric"
      />
      <FormField
        label="Net weight (grams)"
        value={item.net_grams}
        onChangeText={(net_grams) => onPatch({ net_grams })}
        keyboardType="numeric"
      />
      {(() => {
        try {
          return gramsInputToMg(item.net_grams) > gramsInputToMg(item.gross_grams);
        } catch {
          return false;
        }
      })() ? (
        <ThemedText type="small">Net weight cannot exceed gross weight.</ThemedText>
      ) : null}
      <FormField
        label="Quantity"
        value={item.quantity}
        onChangeText={(quantity) => onPatch({ quantity })}
        keyboardType="numeric"
      />

      {item.metal === 'gold' ? (
        <>
          <ThemedText type="small">Purity (optional — do not assume 22K)</ThemedText>
          <View style={styles.chipRow}>
            {GOLD_PURITY_OPTIONS.map((option) => (
              <ChoiceChip
                key={option.label}
                label={option.label}
                selected={item.purity_karat === option.value}
                onPress={() => onPatch({ purity_karat: option.value })}
              />
            ))}
          </View>
        </>
      ) : item.metal === 'silver' ? (
        <ThemedText type="small">
          Silver purity is not stored as karat. Leave unassessed until a millesimal is decided.
        </ThemedText>
      ) : (
        <ThemedText type="small">Choose gold or silver before saving. Nothing is pre-selected.</ThemedText>
      )}
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
  const [items, dispatchItems] = useReducer(scannerItemsReducer, [emptyScannerItem('item-1')]);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const updateForm = useCallback((key: keyof LoanFormData, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
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
      const extracted = await extractReceiptData(photo.uri);
      setForm({
        serial_number: extracted.serial_number,
        customer_name: extracted.customer_name,
        phone_number: extracted.phone_number,
        address: extracted.address,
        loan_amount_rupees: extracted.loan_amount ? String(extracted.loan_amount) : '',
        interest_percent_monthly: extracted.interest_rate ? String(extracted.interest_rate) : '3',
        disbursed_on: extracted.date || todayInKolkata(),
      });
      dispatchItems({
        type: 'seedFromOcr',
        ornamentType: extracted.item_name,
        grossGrams: extracted.weight_grams ? String(extracted.weight_grams) : '',
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
      const loanId = await createLoanWithCustomer(form, items, localPhotoUri, signatureDataUrl);
      Alert.alert('Saved', 'Girvi loan created successfully.', [
        { text: 'View loan', onPress: () => router.replace(`/(admin)/loan/${loanId}`) },
        { text: 'Dashboard', onPress: () => router.replace('/(admin)/dashboard') },
      ]);
    } catch (error) {
      if (error instanceof LoanPhotosIncompleteError) {
        Alert.alert('Loan saved, photos incomplete', error.message, [
          {
            text: 'Retry photos',
            onPress: () => {
              void (async () => {
                setIsBusy(true);
                try {
                  await attachItemPhotos({
                    loanId: error.loanId,
                    serialNumber: error.serialNumber,
                    customerId: error.customerId,
                    items,
                    itemIds: error.itemIds,
                    fromIndex: error.nextIndex,
                  });
                  Alert.alert('Saved', 'Item photos attached.', [
                    {
                      text: 'View loan',
                      onPress: () => router.replace(`/(admin)/loan/${error.loanId}`),
                    },
                  ]);
                } catch (retryError) {
                  Alert.alert(
                    retryError instanceof LoanPhotosIncompleteError
                      ? 'Loan saved, photos incomplete'
                      : 'Save failed',
                    retryError instanceof Error ? retryError.message : 'Unknown error',
                  );
                } finally {
                  setIsBusy(false);
                }
              })();
            },
          },
          {
            text: 'View loan',
            onPress: () => router.replace(`/(admin)/loan/${error.loanId}`),
          },
        ]);
        return;
      }
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

        <View style={[styles.rateCard, { backgroundColor: colors.backgroundElement }]}>
          <ThemedText type="smallBold">Live rate</ThemedText>
          <ThemedText type="small">Rate unavailable</ThemedText>
        </View>

        <FormField label="Serial Number" value={form.serial_number} onChangeText={(v) => updateForm('serial_number', v)} />
        <FormField label="Customer Name" value={form.customer_name} onChangeText={(v) => updateForm('customer_name', v)} />
        <FormField
          label="Phone Number"
          value={form.phone_number}
          onChangeText={(v) => updateForm('phone_number', v)}
          keyboardType="phone-pad"
        />
        <FormField label="Address" value={form.address} onChangeText={(v) => updateForm('address', v)} />
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

        <ThemedText type="smallBold">Pledged items</ThemedText>
        {items.map((item, index) => (
          <PledgeItemCard
            key={item.key}
            item={item}
            index={index}
            canRemove={items.length > 1}
            onPatch={(patch) => dispatchItems({ type: 'patch', key: item.key, patch })}
            onRemove={() => dispatchItems({ type: 'remove', key: item.key })}
          />
        ))}
        <Pressable
          style={[styles.secondaryBtn, { borderColor: colors.backgroundSelected }]}
          onPress={() => dispatchItems({ type: 'add' })}>
          <ThemedText type="smallBold">Add another item</ThemedText>
        </Pressable>

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
  rateCard: { borderRadius: 12, padding: Spacing.three, gap: Spacing.one },
  field: { gap: Spacing.one },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  itemCard: { borderRadius: 12, padding: Spacing.three, gap: Spacing.two },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  chip: { borderRadius: 999, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  signatureBox: { height: 220, borderRadius: 12, overflow: 'hidden' },
  signatureCanvas: { flex: 1 },
  primaryBtn: {
    borderRadius: 12,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  secondaryBtn: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
});
