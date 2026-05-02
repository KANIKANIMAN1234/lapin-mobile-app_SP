import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/** モバイルログイン画面用: 会社名 */
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json({ company_name: null, error: 'missing_env' }, { status: 200 });
  }

  const supabase = createClient(url, key);
  const { data, error } = await supabase.from('m_settings').select('value').eq('key', 'company_name').maybeSingle();

  if (error) {
    console.error('[public/company-brand]', error.message);
    return NextResponse.json({ company_name: null }, { status: 200 });
  }

  return NextResponse.json({
    company_name: (data?.value as string)?.trim() || null,
  });
}
