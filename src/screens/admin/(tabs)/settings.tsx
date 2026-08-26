/**
 * Settings tab: sign out for owner and staff. Shop defaults stay owner-only.
 * RLS + update_shop_defaults / set_loans_concealed are the security boundary.
 *
 * Expo Router (SDK 57): https://docs.expo.dev/versions/v57.0.0/sdk/router/
 * Haptics (SDK 57): https://docs.expo.dev/versions/v57.0.0/sdk/haptics/
 */
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';

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
import { persistPracticeMode, readPracticeMode } from '@/lib/practice-mode';
import { ADMIN_ARCHIVE_HREF, isShopOwner } from '@/lib/shop-tab-access';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import { useNetwork } from '@/providers/network-provider';
import {
  fetchLoansConcealed,
  fetchShopDefaults,
  setLoansConcealed,
  updateShopDefaults,
} from '@/services/loanService';
import { createShopUser, type ShopTeamRole } from '@/services/shopUserService';
import type { PartialPeriodMode, Profile, UserRole } from '@/types/database';

function shopRoleLabel(
  role: UserRole | undefined,
  t: (key: string, options?: Record<string, string | number>) => string,
): string {
  switch (role) {
    case 'owner':
      return t('settings.roleOwner');
    case 'staff':
      return t('settings.roleStaff');
    case 'retail_customer':
      return t('common.customer');
    case 'merchant':
      return t('loans.interestModel.merchant');
    case undefined:
      return '';
    default: {
      const _exhaustive: never = role;
      return _exhaustive;
    }
  }
}

function AccountCard({ profile }: { profile: Profile | null }) {
  const colors = useTheme();
  const { t } = useLanguage();

  return (
    <Card style={styles.accountCard}>
      <View style={styles.accountRow}>
        <TintedIconWell tint={colors.tintPrimary}>
          <AppIcon ios="storefront" android="storefront" color={colors.primary} />
        </TintedIconWell>
        <View style={styles.accountCopy}>
          <ThemedText type="bodyLarge">
            {profile?.full_name ?? t('common.unknown')}
          </ThemedText>
          {profile?.phone_number ? (
            <ThemedText type="label" style={{ color: colors.accentWarning }}>
              {profile.phone_number}
            </ThemedText>
          ) : null}
          <ThemedText type="caption" themeColor="textSecondary">
            {shopRoleLabel(profile?.role, t)}
          </ThemedText>
        </View>
      </View>
    </Card>
  );
}

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
  const { isOffline } = useNetwork();

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
  const [loansConcealed, setLoansConcealedState] = useState(false);
  const [concealBusy, setConcealBusy] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [teamPhone, setTeamPhone] = useState('');
  const [teamPin, setTeamPin] = useState('');
  const [teamRole, setTeamRole] = useState<ShopTeamRole>('staff');
  const [teamBusy, setTeamBusy] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [teamNotice, setTeamNotice] = useState<string | null>(null);
  const [practiceMode, setPracticeMode] = useState(false);

  const isOwner = isShopOwner(profile?.role);

  useEffect(() => {
    void readPracticeMode().then(setPracticeMode).catch(() => setPracticeMode(false));
  }, []);

  useEffect(() => {
    if (isOwner) return;
    void fetchLoansConcealed()
      .then(setLoansConcealedState)
      .catch(() => {
        setLoansConcealedState(false);
      });
  }, [isOwner]);

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
        setLoansConcealedState(defaults.loans_concealed);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : t('settings.loadErrorBody'));
      } finally {
        setIsLoading(false);
      }
    })();
  }, [isOwner, t]);

  const handleConcealToggle = async (next: boolean) => {
    setFormError(null);
    setFormNotice(null);
    setLoansConcealedState(next);
    setConcealBusy(true);
    void Haptics.selectionAsync();
    try {
      const stored = await setLoansConcealed(next);
      setLoansConcealedState(stored);
      setFormNotice(stored ? t('settings.concealOn') : t('settings.concealOff'));
    } catch (error) {
      setLoansConcealedState(!next);
      const message = error instanceof Error ? error.message : t('errors.unknown');
      setFormError(parseOwnerOnlyError(message) ? t('settings.ownerOnly') : message);
    } finally {
      setConcealBusy(false);
    }
  };

  const handleSave = async () => {
    setFormError(null);
    setFormNotice(null);
    setIsSaving(true);
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

  const handleCreateTeamMember = async () => {
    setTeamError(null);
    setTeamNotice(null);
    setTeamBusy(true);
    void Haptics.selectionAsync();
    try {
      const result = await createShopUser({
        phoneNumber: teamPhone,
        fullName: teamName,
        role: teamRole,
        pin: teamPin,
      });
      if (!result.ok) {
        if (result.code === 'weak_pin') {
          setTeamError(t('settings.teamWeakPin'));
        } else if (result.code === 'conflict') {
          setTeamError(result.message ?? t('settings.teamConflict'));
        } else if (result.code === 'forbidden') {
          setTeamError(t('settings.teamForbidden'));
        } else {
          setTeamError(result.message ?? t('errors.unknown'));
        }
        return;
      }
      setTeamName('');
      setTeamPhone('');
      setTeamPin('');
      setTeamRole('staff');
      setTeamNotice(t('settings.teamCreated'));
    } catch (error) {
      setTeamError(error instanceof Error ? error.message : t('errors.unknown'));
    } finally {
      setTeamBusy(false);
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
          <AccountCard profile={profile} />
          <ThemedText type="small" style={styles.hint}>
            {t('settings.staffHint')}
          </ThemedText>
          {loansConcealed ? (
            <View style={{ paddingHorizontal: Spacing.four }}>
              <FormNotice info={t('settings.staffConcealed')} />
            </View>
          ) : null}
          <SectionLabel>{t('settings.groupPreferences')}</SectionLabel>
          <SettingsGroup>
            <LanguageSettingsRow />
            <ListRow
              testID="practice-mode-row"
              tone="elevated"
              isLast
              leading={
                <TintedIconWell tint={colors.tintWarning}>
                  <AppIcon ios="flask" android="science" color={colors.onTintWarning} />
                </TintedIconWell>
              }
              content={
                <View>
                  <ThemedText type="bodyLarge">{t('settings.practiceMode')}</ThemedText>
                  <ThemedText type="caption" themeColor="textSecondary">
                    {t('settings.practiceModeHint')}
                  </ThemedText>
                </View>
              }
              trailing={
                <Switch
                  testID="practice-mode-switch"
                  value={practiceMode}
                  onValueChange={(next) => {
                    setPracticeMode(next);
                    void persistPracticeMode(next);
                  }}
                  trackColor={{ false: colors.backgroundElement, true: colors.warning }}
                  thumbColor={colors.elevated}
                />
              }
            />
          </SettingsGroup>
          {practiceMode ? (
            <View style={{ paddingHorizontal: Spacing.four }}>
              <FormNotice info={t('settings.practiceModeOn')} />
            </View>
          ) : null}
          {signOutRow}
        </ScrollView>
      </ThemedView>
    );
  }

  if (isLoading) {
    return (
      <ThemedView style={styles.container} type="surfaceSunken">
        <ScreenHeader title={t('settings.title')} />
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
      <ScreenHeader title={t('settings.title')} />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: tabBarPadding }]}>
        <AccountCard profile={profile} />

        <SectionLabel>{t('settings.groupPreferences')}</SectionLabel>
        <SettingsGroup>
          <LanguageSettingsRow />
          <ListRow
            testID="practice-mode-row"
            tone="elevated"
            isLast
            leading={
              <TintedIconWell tint={colors.tintWarning}>
                <AppIcon ios="flask" android="science" color={colors.onTintWarning} />
              </TintedIconWell>
            }
            content={
              <View>
                <ThemedText type="bodyLarge">{t('settings.practiceMode')}</ThemedText>
                <ThemedText type="caption" themeColor="textSecondary">
                  {t('settings.practiceModeHint')}
                </ThemedText>
              </View>
            }
            trailing={
              <Switch
                testID="practice-mode-switch"
                value={practiceMode}
                onValueChange={(next) => {
                  setPracticeMode(next);
                  void persistPracticeMode(next);
                }}
                trackColor={{ false: colors.backgroundElement, true: colors.warning }}
                thumbColor={colors.elevated}
              />
            }
          />
        </SettingsGroup>
        {practiceMode ? (
          <View style={{ paddingHorizontal: Spacing.four }}>
            <FormNotice info={t('settings.practiceModeOn')} />
          </View>
        ) : null}

        <SectionLabel>{t('settings.groupTeam')}</SectionLabel>
        <ThemedText type="small" style={styles.hint}>
          {t('settings.teamHint')}
        </ThemedText>
        <FormNotice error={teamError} notice={teamNotice} />
        <Card>
          <Field
            label={t('settings.teamName')}
            value={teamName}
            onChangeText={setTeamName}
            testID="team-name"
          />
          <Field
            label={t('settings.teamPhone')}
            value={teamPhone}
            onChangeText={setTeamPhone}
            keyboardType="phone-pad"
            testID="team-phone"
          />
          <Field
            label={t('settings.teamPin')}
            value={teamPin}
            onChangeText={setTeamPin}
            keyboardType="number-pad"
            secureTextEntry
            testID="team-pin"
          />
          <ThemedText type="smallBold">{t('settings.teamRole')}</ThemedText>
          <View style={styles.modeRow}>
            {(['staff', 'owner'] as ShopTeamRole[]).map((id) => (
              <PressableScale
                key={id}
                testID={`team-role-${id}`}
                onPress={() => setTeamRole(id)}
                style={[
                  styles.modeChip,
                  {
                    backgroundColor:
                      teamRole === id ? colors.tintPrimary : colors.backgroundElement,
                    borderColor: teamRole === id ? colors.primary : colors.border,
                  },
                ]}>
                <ThemedText type="label">
                  {id === 'staff' ? t('settings.teamCreateStaff') : t('settings.teamCreateOwner')}
                </ThemedText>
              </PressableScale>
            ))}
          </View>
          <Button
            testID="create-team-member"
            label={t('settings.teamCreate')}
            loading={teamBusy}
            requiresNetwork
            onPress={() => void handleCreateTeamMember()}
          />
        </Card>

        <SectionLabel>{t('settings.groupShop')}</SectionLabel>
        <SettingsGroup>
          <ListRow
            testID="conceal-loans-row"
            tone="elevated"
            leading={
              <TintedIconWell tint={colors.tintDanger}>
                <AppIcon ios="eye.slash" android="lock" color={colors.onTintDanger} />
              </TintedIconWell>
            }
            content={
              <View>
                <ThemedText type="bodyLarge">{t('settings.concealLoans')}</ThemedText>
                <ThemedText type="caption" themeColor="textSecondary">
                  {t('settings.concealLoansHint')}
                </ThemedText>
              </View>
            }
            trailing={
              <Switch
                testID="conceal-loans-switch"
                value={loansConcealed}
                disabled={concealBusy || isOffline}
                onValueChange={(value) => void handleConcealToggle(value)}
                ios_backgroundColor={colors.backgroundSelected}
                trackColor={{ false: colors.backgroundElement, true: colors.primary }}
                thumbColor={colors.elevated}
                accessibilityLabel={
                  isOffline ? t('network.unavailableOffline') : t('settings.concealLoans')
                }
                accessibilityState={{
                  checked: loansConcealed,
                  disabled: concealBusy || isOffline,
                }}
              />
            }
          />
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
                      partialPeriodMode === id ? colors.tintPrimary : colors.backgroundElement,
                    borderColor: partialPeriodMode === id ? colors.primary : colors.border,
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
          requiresNetwork
          style={styles.saveButton}
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
  accountCard: { marginHorizontal: Spacing.four, marginTop: Spacing.three },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  accountCopy: { flex: 1, minWidth: 0, gap: Spacing.half },
  modeRow: { gap: Spacing.two, flexDirection: 'row', flexWrap: 'wrap' },
  modeChip: {
    minHeight: MinTouchTarget,
    borderRadius: Radii.pill,
    paddingHorizontal: Spacing.three,
    borderWidth: 1,
    borderColor: 'transparent',
    justifyContent: 'center',
  },
  saveButton: { marginHorizontal: Spacing.four },
});
