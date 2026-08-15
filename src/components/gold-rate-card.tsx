import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatPaiseAsInr, todayInKolkata } from '@/lib/money';
import {
  fetchGoldRatesForDate,
  pickRateForMillesimal,
  refreshGoldRateFeed,
  setManualGoldRate,
} from '@/services/goldRateService';
import type { GoldRate } from '@/types/database';

const OVERRIDE_BANDS: Array<{ label: string; millesimal: 999 | 916 | 750 }> = [
  { label: '24K (999)', millesimal: 999 },
  { label: '22K (916)', millesimal: 916 },
  { label: '18K (75%)', millesimal: 750 },
];

function sourceCaption(source: GoldRate['source']): string {
  switch (source) {
    case 'manual':
      return 'manual override · not IBJA';
    case 'goldapi':
      return 'GoldAPI · not IBJA';
    case 'metals_dev':
      return 'metals.dev · not IBJA';
    default: {
      const _exhaustive: never = source;
      return _exhaustive;
    }
  }
}

export function GoldRateCard({ isOwner }: { isOwner: boolean }) {
  const colors = useTheme();
  const [rates, setRates] = useState<GoldRate[]>([]);
  const [status, setStatus] = useState('Loading rate…');
  const [isBusy, setIsBusy] = useState(false);
  const [overrideBand, setOverrideBand] = useState<999 | 916 | 750>(999);
  const [overrideRupees, setOverrideRupees] = useState('');
  const [overrideError, setOverrideError] = useState<string | null>(null);

  async function loadRates() {
    const rows = await fetchGoldRatesForDate(todayInKolkata());
    setRates(rows);
    const display = pickRateForMillesimal(rows, 999) ?? pickRateForMillesimal(rows, 916);
    if (!display) {
      setStatus('Rate unavailable · not IBJA. Saving still works.');
      return;
    }
    setStatus(
      `${formatPaiseAsInr(display.price_per_10g_paise)} / 10g of ${display.purity_millesimal} · ${sourceCaption(display.source)}`,
    );
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await refreshGoldRateFeed();
      if (cancelled) return;
      try {
        await loadRates();
      } catch {
        if (!cancelled) {
          setStatus('Rate unavailable · not IBJA. Saving still works.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveOverride() {
    setOverrideError(null);
    setIsBusy(true);
    try {
      await setManualGoldRate({
        millesimal: overrideBand,
        rupeesPer10g: overrideRupees,
      });
      setOverrideRupees('');
      await loadRates();
    } catch (error) {
      setOverrideError(error instanceof Error ? error.message : 'Could not save override.');
    } finally {
      setIsBusy(false);
    }
  }

  const band999 = pickRateForMillesimal(rates, 999);
  const band916 = pickRateForMillesimal(rates, 916);
  const band750 = pickRateForMillesimal(rates, 750);

  return (
    <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
      <ThemedText type="smallBold">Gold rate · not IBJA</ThemedText>
      <ThemedText type="small">{status}</ThemedText>
      {band999 ? (
        <ThemedText type="small">
          24K (999): {formatPaiseAsInr(band999.price_per_10g_paise)} / 10g
        </ThemedText>
      ) : null}
      {band916 ? (
        <ThemedText type="small">
          22K (916): {formatPaiseAsInr(band916.price_per_10g_paise)} / 10g
        </ThemedText>
      ) : (
        <ThemedText type="small">22K (916) is 91.6% of the 24K quote at save.</ThemedText>
      )}
      {band750 ? (
        <ThemedText type="small">
          18K (75% / 750): {formatPaiseAsInr(band750.price_per_10g_paise)} / 10g
        </ThemedText>
      ) : (
        <ThemedText type="small">18K is 75% (750) of the 24K quote at save.</ThemedText>
      )}
      <ThemedText type="small">Silver is weight-only and is not valued. Wastage and LTV are not applied.</ThemedText>

      {isOwner ? (
        <>
          <ThemedText type="smallBold">Owner override · not IBJA (₹ / 10g)</ThemedText>
          <View style={styles.chipRow}>
            {OVERRIDE_BANDS.map((band) => (
              <Pressable
                key={band.millesimal}
                onPress={() => setOverrideBand(band.millesimal)}
                style={[
                  styles.chip,
                  {
                    backgroundColor:
                      overrideBand === band.millesimal
                        ? colors.backgroundSelected
                        : colors.background,
                  },
                ]}>
                <ThemedText type="small">{band.label}</ThemedText>
              </Pressable>
            ))}
          </View>
          <TextInput
            value={overrideRupees}
            onChangeText={setOverrideRupees}
            keyboardType="numeric"
            placeholder="e.g. 151493"
            placeholderTextColor={colors.textSecondary}
            style={[styles.input, { borderColor: colors.backgroundSelected, color: colors.text }]}
          />
          <Pressable
            onPress={() => void saveOverride()}
            disabled={isBusy}
            style={[styles.button, { backgroundColor: colors.backgroundSelected }]}>
            {isBusy ? <ActivityIndicator /> : <ThemedText type="smallBold">Save override</ThemedText>}
          </Pressable>
          {overrideError ? <ThemedText type="small">{overrideError}</ThemedText> : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: 12,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 999,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  button: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: 8,
  },
});
