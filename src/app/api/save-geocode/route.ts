import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ success: false, error: 'Supabase env not set' }, { status: 500 });
  }

  let body: { id: string; lat: number; lng: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const { id, lat, lng } = body;
  if (!id || lat == null || lng == null) {
    return NextResponse.json({ success: false, error: 'id / lat / lng required' }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { error } = await supabase
    .from('t_projects')
    .update({ lat, lng })
    .eq('id', id);

  if (error) {
    console.error('[save-geocode] update error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
