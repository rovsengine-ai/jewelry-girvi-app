/**
 * Shared Realtime subscription for loans + payments.
 * Both admin and customer loan tabs call this; each screen re-fetches from SQL
 * on change — never trust payload amounts for balances.
 *
 * Docs: https://supabase.com/docs/guides/realtime/postgres-changes
 * Docs: https://github.com/supabase/supabase-js (removeChannel / removeAllChannels)
 */
import { useEffect, useRef } from 'react';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

export type LoansPaymentsChangeHandler = () => void;

/**
 * Subscribes while the user has a session. Tears down on unmount, when the
 * session user changes, and relies on AuthProvider.signOut calling
 * removeAllChannels so a leaked channel cannot bleed into the next login.
 */
export function useLoansPaymentsRealtime(onChange: LoansPaymentsChangeHandler): void {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!userId) {
      return;
    }

    const channelName = `loans-payments:${userId}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'loans' },
        () => {
          onChangeRef.current();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payments' },
        () => {
          onChangeRef.current();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);
}
