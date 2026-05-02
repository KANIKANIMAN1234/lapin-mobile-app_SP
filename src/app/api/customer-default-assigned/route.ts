import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

async function getBearerUserId(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  const supabase = createClient(url, anon);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user.id;
}

function createAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase server env が不足しています');
  return createClient(url, key);
}

/** 顧客の有効案件のうち、問い合わせ日・更新日が新しいものの assigned_to */
async function getLatestAssignedForCustomer(
  admin: SupabaseClient,
  customerId: string
): Promise<string | null> {
  const { data } = await admin
    .from('t_projects')
    .select('assigned_to')
    .eq('customer_id', customerId)
    .is('deleted_at', null)
    .order('inquiry_date', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.assigned_to as string) ?? null;
}

export async function GET(req: NextRequest) {
  try {
    const userId = await getBearerUserId(req);
    if (!userId) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const customerId = req.nextUrl.searchParams.get('customerId')?.trim();
    if (!customerId) {
      return NextResponse.json({ error: 'customerId が必要です' }, { status: 400 });
    }

    const admin = createAdmin();

    const { data: profile, error: pErr } = await admin
      .from('m_users')
      .select('role')
      .eq('id', userId)
      .maybeSingle();
    if (pErr || !profile?.role) {
      return NextResponse.json({ error: 'ユーザー情報が取得できません' }, { status: 403 });
    }
    const role = profile.role as string;
    if (!['admin', 'staff', 'sales'].includes(role)) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    }

    const { data: cust } = await admin
      .from('m_customers')
      .select('id')
      .eq('id', customerId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!cust?.id) {
      return NextResponse.json({ error: '顧客が見つかりません' }, { status: 404 });
    }

    const assignedTo = await getLatestAssignedForCustomer(admin, customerId);
    return NextResponse.json({ assignedTo });
  } catch (e) {
    console.error('[customer-default-assigned]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
