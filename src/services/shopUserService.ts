import {
  edgeFunctionErrorMessage,
  readEdgeFunctionErrorBody,
  requireUserAccessToken,
} from '@/lib/edge-invoke';
import { toE164India } from '@/lib/phone';
import { supabase } from '@/lib/supabase';

export type ShopTeamRole = 'staff' | 'owner';

export type CreateShopUserResult =
  | { ok: true; userId: string; role: ShopTeamRole }
  | { ok: false; code: 'weak_pin' | 'conflict' | 'forbidden' | 'invalid' | 'server'; message?: string };

export async function createShopUser(params: {
  phoneNumber: string;
  fullName: string;
  role: ShopTeamRole;
  pin: string;
}): Promise<CreateShopUserResult> {
  const accessToken = await requireUserAccessToken();
  const { data, error } = await supabase.functions.invoke<{
    user_id?: string;
    role?: ShopTeamRole;
    error?: string;
  }>('create-shop-user', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: {
      phone_number: toE164India(params.phoneNumber),
      full_name: params.fullName.trim(),
      role: params.role,
      pin: params.pin.trim(),
    },
  });

  if (error) {
    const payload = await readEdgeFunctionErrorBody(error);
    const message =
      payload?.error?.trim() ||
      edgeFunctionErrorMessage(error, 'Could not create the shop account.');
    if (message.includes('owner only') || message.includes('Forbidden')) {
      return { ok: false, code: 'forbidden', message };
    }
    if (message.includes('already exists') || message.includes('customer account')) {
      return { ok: false, code: 'conflict', message };
    }
    if (message.includes('weak_pin')) {
      return { ok: false, code: 'weak_pin' };
    }
    if (message.includes('6 digits')) {
      return { ok: false, code: 'invalid', message };
    }
    return { ok: false, code: 'server', message };
  }

  if (data?.error) {
    if (data.error.includes('weak_pin')) {
      return { ok: false, code: 'weak_pin' };
    }
    if (data.error.includes('already') || data.error.includes('customer')) {
      return { ok: false, code: 'conflict', message: data.error };
    }
    return { ok: false, code: 'server', message: data.error };
  }

  if (!data?.user_id) {
    return { ok: false, code: 'server', message: 'No account id returned.' };
  }

  return {
    ok: true,
    userId: data.user_id,
    role: data.role === 'owner' ? 'owner' : 'staff',
  };
}
