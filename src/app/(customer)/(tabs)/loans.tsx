/**
 * Customer receipts. RLS hides rows while the owner conceals the book.
 * Pull-to-refresh / tab focus reloads after reveal.
 *
 * Expo Router (SDK 57): https://docs.expo.dev/versions/v57.0.0/sdk/router/
 */
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Badge } from '@/components/badge';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { FormNotice } from '@/components/form-notice';
import { ListSkeleton } from '@/components/list-row-skeleton';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radii, Sizes, Spacing } from '@/constants/theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useRefreshOnForeground } from '@/hooks/use-refresh-on-foreground';
import { useTabBarScrollPadding } from '@/hooks/use-tab-bar-scroll-padding';
import { customerLoanStatusLabel } from '@/lib/redemption';
import { rowEntering } from '@/lib/motion';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import { fetchLoansConcealed, resolveReceiptDisplayUrl } from '@/services/loanService';
import type { Loan } from '@/types/database';

type CustomerLoanView = Pick<
  Loan,
  'id' | 'serial_number' | 'receipt_image_url' | 'digital_signature_url' | 'status'
> & {
  displayUrl?: string | null;
  signatureUrl?: string | null;
};

export default function CustomerLoansScreen() {
  const { session } = useAuth();
  const { t, language } = useLanguage();
  const tabBarPadding = useTabBarScrollPadding();
  const reduceMotion = useReduceMotion();

  const [loans, setLoans] = useState<CustomerLoanView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loansConcealed, setLoansConcealed] = useState(false);

  const loadLoans = useCallback(async () => {
    if (!session?.user.id) return;

    const concealed = await fetchLoansConcealed();
    setLoansConcealed(concealed);
    if (concealed) {
      setLoans([]);
      return;
    }

    const { data, error } = await supabase
      .from('loans')
      .select('id, serial_number, receipt_image_url, digital_signature_url, status')
      .eq('customer_id', session.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    const rows = (data ?? []) as CustomerLoanView[];
    const withUrls = await Promise.all(
      rows.map(async (row) => ({
        ...row,
        displayUrl: await resolveReceiptDisplayUrl(row.receipt_image_url).catch(() => null),
        signatureUrl: await resolveReceiptDisplayUrl(row.digital_signature_url).catch(() => null),
      })),
    );
    setLoans(withUrls);
  }, [session?.user.id]);

  useRefreshOnForeground(loadLoans);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    setLoadError(null);
    try {
      await loadLoans();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : t('loans.customer.loadError'));
    } finally {
      setIsRefreshing(false);
    }
  }, [loadLoans, t]);

  useFocusEffect(
    useCallback(() => {
      // https://docs.expo.dev/versions/v57.0.0/sdk/router/#usefocuseffecteffect-do_not_pass_a_second_prop
      let active = true;
      void (async () => {
        setLoadError(null);
        try {
          await loadLoans();
        } catch (error) {
          if (active) {
            setLoadError(
              error instanceof Error ? error.message : t('loans.customer.loadError'),
            );
          }
        } finally {
          if (active) setIsLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, [loadLoans, t]),
  );

  return (
    <ThemedView style={styles.container} type="surfaceSunken">
      <ScreenHeader title={t('loans.customer.title')} />
      <View style={styles.body}>
        <ThemedText type="small" themeColor="textSecondary">
          {t('loans.customer.subtitle')}
        </ThemedText>

        <FormNotice error={loadError} />

        {isLoading ? (
          <ListSkeleton rows={4} />
        ) : (
          <FlatList
            data={loans}
            keyExtractor={(item) => item.id}
            refreshControl={
              <RefreshControl refreshing={isRefreshing} onRefresh={() => void refresh()} />
            }
            contentContainerStyle={[styles.listContent, { paddingBottom: tabBarPadding }]}
            ListEmptyComponent={
              <EmptyState
                title={
                  loansConcealed
                    ? t('loans.customer.concealedTitle')
                    : t('loans.customer.emptyTitle')
                }
                body={
                  loansConcealed
                    ? t('loans.customer.concealedBody')
                    : t('loans.customer.emptyBody')
                }
              />
            }
            renderItem={({ item, index }) => (
              <Animated.View entering={rowEntering(index, reduceMotion)}>
                <Card style={styles.card} testID={`customer-loan-${item.serial_number}`}>
                  {item.displayUrl ? (
                    <Image
                      source={{ uri: item.displayUrl }}
                      style={styles.receiptImage}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={styles.receiptPlaceholder}>
                      <ThemedText type="small">{t('loans.customer.noReceiptImage')}</ThemedText>
                    </View>
                  )}
                  {item.signatureUrl ? (
                    <Image
                      source={{ uri: item.signatureUrl }}
                      style={styles.signatureImage}
                      contentFit="contain"
                      accessibilityLabel={t('loans.detail.pledgeSignature')}
                    />
                  ) : null}
                  <View style={styles.badgeWrap}>
                    <Badge
                      status={item.status}
                      label={customerLoanStatusLabel(item.status, language)}
                    />
                  </View>
                  {item.status === 'redeemed' ? (
                    <View style={styles.collectBanner} testID={`customer-loan-collect-${item.serial_number}`}>
                      <ThemedText type="smallBold">{t('loans.customer.collectItemsTitle')}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {t('loans.customer.collectItemsBody')}
                      </ThemedText>
                    </View>
                  ) : null}
                </Card>
              </Animated.View>
            )}
          />
        )}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { flex: 1, paddingHorizontal: Spacing.four, gap: Spacing.two, paddingTop: Spacing.two },
  loader: { marginTop: Spacing.five },
  listContent: { gap: Spacing.three, paddingBottom: Spacing.five },
  card: { overflow: 'hidden', padding: 0 },
  receiptImage: { width: '100%', height: Sizes.receiptImageHeight, borderRadius: Radii.md },
  signatureImage: {
    width: '100%',
    height: Sizes.signatureThumbHeight,
    marginTop: Spacing.two,
    backgroundColor: '#FFFFFF',
  },
  receiptPlaceholder: {
    minHeight: Sizes.receiptPlaceholderHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeWrap: {
    position: 'absolute',
    top: Spacing.two,
    right: Spacing.two,
  },
  collectBanner: {
    gap: Spacing.one,
    padding: Spacing.three,
    paddingTop: Spacing.two,
  },
});
