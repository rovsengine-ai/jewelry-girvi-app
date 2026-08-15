/**
 * Settings tab: sign out for owner and staff. Shop defaults stay owner-only.
 * RLS + update_shop_defaults are the security boundary; hiding the tab is not.
 *
 * Expo Router (SDK 57): https://docs.expo.dev/versions/v57.0.0/sdk/router/
 */
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { AppIcon, TintedIconWell } from '@/components/app-icon';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { Field } from '@/components/field';
import { FormNotice } from '@/components/form-notice';
import { ListRow } from '@/components/list-row';
import { ListSkeleton } from '@/components/list-row-skeleton';
import { PressableScale } from '@/components/pressable-scale';
import { LanguageSettingsRow, ScreenHeader } from '@/components/screen-header';
import { SectionLabel } from '@/components/section-label';
import { SettingsGroup } from '@/components/settings-group';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MinTouchTarget, Radii, Spacing } from '@/constants/theme';
import { useTabBarScrollPadding } from '@/hooks/use-tab-bar-scroll-padding';
import { useTheme } from '@/hooks/use-theme';
import { formatBpsAsPercent, percentInputToBps } from '@/lib/money';
import { parseOwnerOnlyError } from '@/lib/redemption';
import { ADMIN_ARCHIVE_HREF, isShopOwner } from '@/lib/shop-tab-access';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import { fetchShopDefaults, updateShopDefaults } from '@/services/loanService';
import type { PartialPeriodMode } from '@/types/database';

const MODE_KEYS: Record<PartialPeriodMode, string> = {
  min_month_then_pro_rata: 'loans.terms.minMonthThenProRata',
  full_period: 'loans.terms.fullPeriod',
  pro_rata: 'loans.terms.proRata',
};

function parseWholeNumber(raw: string, field: string, t: (key: string, options?: Record<string, string | number>) => string): number {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(t('errors.wholeNumber', { field }));
  }
  return Number.parseInt(trimmed, 10);
}

export default function ShopSettingsScreen() {
  const colors = useTheme();
  const router = useRouter();
  const tabBarPadding = useTabBarScrollPadding();
  const { profile, isLoading: authLoading, signOut } = useAuth();
  const { t } = useLanguage();

  const [ratePercent, setRatePercent] = useState('');
  const [simplePeriodDays, setSimplePeriodDays] = useState('');
  const [compoundEveryDays, setCompoundEveryDays] = useState('');
  const [graceDays, setGraceDays] = useState('');
  const [roundUpThresholdDays, setRoundUpThresholdDays] = useState('');
  const [partialPeriodMode, setPartialPeriodMode] =
    useState<PartialPeriodMode>('min_month_then_pro_rata');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<string | null>(null);

  const isOwner = isShopOwner(profile?.role);

  useEffect(() => {
    if (!isOwner) return;
    void (async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const defaults = await fetchShopDefaults();
        setRatePercent(formatBpsAsPercent(defaults.rate_bps));
        setSimplePeriodDays(String(defaults.simple_period_days));
        setCompoundEveryDays(String(defaults.compound_every_days));
        setGraceDays(String(defaults.grace_days));
        setRoundUpThresholdDays(String(defaults.round_up_threshold_days));
        setPartialPeriodMode(defaults.partial_period_mode);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : t('settings.loadErrorBody'));
      } finally {
        setIsLoading(false);
      }
    })();
  }, [isOwner, t]);

  const handleSave = async () => {
    setFormError(null);
    setFormNotice(null);
    try {
      const rateBps = percentInputToBps(ratePercent);
      const next = await updateShopDefaults({
        rateBps,
        partialPeriodMode,
        roundUpThresholdDays: parseWholeNumber(
          roundUpThresholdDays,
          t('settings.roundUpThreshold'),
          t,
        ),
        simplePeriodDays: parseWholeNumber(simplePeriodDays, t('settings.simplePeriod'), t),
        compoundEveryDays: parseWholeNumber(compoundEveryDays, t('settings.compoundEvery'), t),
        graceDays: parseWholeNumber(graceDays, t('settings.graceDays'), t),
      });
      setRatePercent(formatBpsAsPercent(next.rate_bps));
      setFormNotice(t('settings.saved'));
    } catch (error) {
      const message = error instanceof Error ? error.message : t('errors.unknown');
      if (parseOwnerOnlyError(message)) {
        setFormError(t('settings.ownerOnly'));
      } else {
        setFormError(message);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const signOutRow = (
    <>
      <SectionLabel>{t('settings.groupSession')}</SectionLabel>
      <SettingsGroup>
        <ListRow
          testID="sign-out"
          tone="elevated"
          isLast
          onPress={() => void signOut()}
          leading={
            <TintedIconWell tint={colors.tintDanger}>
              <AppIcon
                ios="rectangle.portrait.and.arrow.right"
                android="logout"
                color={colors.onTintDanger}
              />
            </TintedIconWell>
          }
          content={
            <ThemedText type="bodyLarge" style={{ color: colors.danger }}>
              {t('common.signOut')}
            </ThemedText>
          }
        />
      </SettingsGroup>
    </>
  );

  if (authLoading) {
    return (
      <ThemedView style={styles.container} type="surfaceSunken">
        <ScreenHeader title={t('settings.title')} />
        <ListSkeleton rows={4} />
      </ThemedView>
    );
  }

  if (!isOwner) {
    return (
      <ThemedView style={styles.container} type="surfaceSunken">
        <ScreenHeader title={t('settings.title')} />
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: tabBarPadding }]}>
          <ThemedText type="small" style={styles.hint}>
            {t('settings.staffHint')}
          </ThemedText>
          <SectionLabel>{t('settings.groupPreferences')}</SectionLabel>
          <SettingsGroup>
            <LanguageSettingsRow />
          </SettingsGroup>
          {signOutRow}
        </ScrollView>
      </ThemedView>
    );
  }

  if (isLoading) {
    return (
      <ThemedView style={styles.container} type="surfaceSunken">
        <ScreenHeader title={t('settings.shopDefaults')} />
        <ListSkeleton rows={6} />
      </ThemedView>
    );
  }

  if (loadError) {
    return (
      <ThemedView style={styles.container} type="surfaceSunken">
        <ScreenHeader title={t('settings.title')} />
        <EmptyState title={t('settings.loadErrorTitle')} body={loadError} />
        {signOutRow}
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container} type="surfaceSunken">
      <ScreenHeader title={t('settings.shopDefaults')} />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: tabBarPadding }]}>
        <SectionLabel>{t('settings.groupPreferences')}</SectionLabel>
        <SettingsGroup>
          <LanguageSettingsRow />
        </SettingsGroup>

        <SectionLabel>{t('settings.groupShop')}</SectionLabel>
        <SettingsGroup>
          <ListRow
            testID="open-archive-list"
            tone="elevated"
            isLast
            onPress={() => router.push(ADMIN_ARCHIVE_HREF)}
            leading={
              <TintedIconWell tint={colors.tintPrimary}>
                <AppIcon ios="archivebox" android="inventory_2" color={colors.primary} />
              </TintedIconWell>
            }
            content={<ThemedText type="bodyLarge">{t('archive.openList')}</ThemedText>}
            trailing={
              <AppIcon
                ios="chevron.right"
                android="chevron_right"
                color={colors.textSecondary}
                accessibilityLabel={t('a11y.chevron')}
              />
            }
          />
        </SettingsGroup>

        <FormNotice
          info={t('settings.shopDefaultsInfo')}
          error={formError}
          notice={formNotice}
        />

        <Card>
          <Field
            label={t('settings.rateLabel')}
            value={ratePercent}
            onChangeText={setRatePercent}
            keyboardType="decimal-pad"
            testID="settings-rate"
          />
          <ThemedText type="small">{t('settings.rateHint')}</ThemedText>
          <Field
            label={t('settings.simplePeriod')}
            value={simplePeriodDays}
            onChangeText={setSimplePeriodDays}
            keyboardType="number-pad"
          />
          <Field
            label={t('settings.compoundEvery')}
            value={compoundEveryDays}
            onChangeText={setCompoundEveryDays}
            keyboardType="number-pad"
          />
          <Field
            label={t('settings.graceDays')}
            value={graceDays}
            onChangeText={setGraceDays}
            keyboardType="number-pad"
          />
          <Field
            label={t('settings.roundUpThreshold')}
            value={roundUpThresholdDays}
            onChangeText={setRoundUpThresholdDays}
            keyboardType="number-pad"
          />
          <ThemedText type="smallBold">{t('settings.partialPeriodMode')}</ThemedText>
          <View style={styles.modeRow}>
            {(Object.keys(MODE_KEYS) as PartialPeriodMode[]).map((id) => (
              <PressableScale
                key={id}
                onPress={() => setPartialPeriodMode(id)}
                style={[
                  styles.modeChip,
                  {
                    backgroundColor:
                      partialPeriodMode === id ? colors.tintPrimary : colors.elevated,
                  },
                ]}>
                <ThemedText type="label">{t(MODE_KEYS[id])}</ThemedText>
              </PressableScale>
            ))}
          </View>
        </Card>

        <Button
          testID="save-shop-defaults"
          label={t('settings.saveDefaults')}
          loading={isSaving}
          onPress={() => {
            setIsSaving(true);
            void handleSave();
          }}
        />
        {signOutRow}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingBottom: Spacing.five, gap: Spacing.three },
  hint: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three },
  modeRow: { gap: Spacing.two },
  modeChip: {
    minHeight: MinTouchTarget,
    borderRadius: Radii.pill,
    paddingHorizontal: Spacing.two,
    justifyContent: 'center',
  },
});
