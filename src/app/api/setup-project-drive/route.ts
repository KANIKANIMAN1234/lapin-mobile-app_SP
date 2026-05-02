import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  ensureFolderPathFromTemplate,
  findOrCreateChildFolder,
  folderWebUrl,
  getDriveClient,
  isDriveConfigured,
  parseFolderTemplateJson,
  sanitizeDriveSegment,
} from '@/lib/google-drive-server';

type Mode = 'new' | 'existing';

interface Body {
  projectId: string;
  mode: Mode;
}

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

async function assertCanAccessProject(
  admin: SupabaseClient,
  userId: string,
  project: { created_by: string | null; assigned_to: string }
): Promise<boolean> {
  const { data: profile } = await admin
    .from('m_users')
    .select('role')
    .eq('id', userId)
    .maybeSingle();
  const role = profile?.role as string | undefined;
  if (role === 'admin' || role === 'staff') return true;
  if (role === 'sales') {
    return project.created_by === userId || project.assigned_to === userId;
  }
  return false;
}

function createAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase server env が不足しています');
  return createClient(url, key);
}

function projectFolderLabel(
  projectNumber: string | null,
  workType: string[],
  workDescription: string,
  customerName: string
): string {
  const jobName =
    (workType?.length ? workType.join('・') : '') ||
    (workDescription?.trim() ? sanitizeDriveSegment(workDescription.split('\n')[0] ?? '', 80) : '') ||
    customerName;
  const num = projectNumber ?? '番号不明';
  return sanitizeDriveSegment(`${num} ${jobName}`, 200);
}

function customerFolderLabel(
  customerNumber: string | null,
  customerName: string,
  address: string
): string {
  const cn = customerNumber ?? '番号未定';
  return sanitizeDriveSegment(`${cn} ${customerName} ${address}`, 220);
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getBearerUserId(req);
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const body = (await req.json()) as Body;
    if (!body?.projectId || (body.mode !== 'new' && body.mode !== 'existing')) {
      return NextResponse.json({ success: false, error: 'projectId / mode が不正です' }, { status: 400 });
    }

    if (!isDriveConfigured()) {
      return NextResponse.json({
        success: false,
        skipped: true,
        error: 'GOOGLE_SERVICE_ACCOUNT_JSON が未設定のため Drive をスキップしました',
      });
    }

    const drive = getDriveClient();
    if (!drive) {
      return NextResponse.json({ success: false, error: 'Google Drive クライアント初期化に失敗しました' }, { status: 500 });
    }

    const admin = createAdmin();

    const { data: project, error: projErr } = await admin
      .from('t_projects')
      .select(
        `
        id,
        project_number,
        customer_name,
        work_type,
        work_description,
        customer_id,
        created_by,
        assigned_to,
        m_customers (
          id,
          customer_number,
          customer_name,
          address,
          drive_folder_id,
          drive_folder_url
        )
      `
      )
      .eq('id', body.projectId)
      .maybeSingle();

    if (projErr || !project) {
      return NextResponse.json({ success: false, error: '案件が見つかりません' }, { status: 404 });
    }

    const row = project as unknown as {
      id: string;
      project_number: string | null;
      customer_name: string;
      work_type: string[];
      work_description: string;
      customer_id: string | null;
      created_by: string | null;
      assigned_to: string;
      m_customers: {
        id: string;
        customer_number: string | null;
        customer_name: string;
        address: string;
        drive_folder_id: string | null;
        drive_folder_url: string | null;
      } | null;
    };

    if (!row.customer_id || !row.m_customers) {
      return NextResponse.json(
        { success: false, error: '案件に顧客マスタ(customer_id)が紐づいていません' },
        { status: 400 }
      );
    }

    const ok = await assertCanAccessProject(admin, userId, {
      created_by: row.created_by,
      assigned_to: row.assigned_to,
    });
    if (!ok) {
      return NextResponse.json({ success: false, error: 'この案件への操作権限がありません' }, { status: 403 });
    }

    const { data: settingsRows } = await admin.from('m_settings').select('key, value').in('key', ['drive_root_folder_id', 'drive_folder_template']);
    const settings: Record<string, string> = {};
    for (const r of settingsRows ?? []) {
      if (r.key && r.value != null) settings[r.key] = r.value as string;
    }
    const rootId = settings.drive_root_folder_id?.trim();
    if (!rootId) {
      return NextResponse.json({
        success: false,
        skipped: true,
        error: 'drive_root_folder_id が m_settings に未設定です',
      });
    }

    const templatePaths = parseFolderTemplateJson(settings.drive_folder_template);

    const customer = row.m_customers;
    let customerFolderId = customer.drive_folder_id;

    if (!customerFolderId) {
      const folderName = customerFolderLabel(
        customer.customer_number,
        customer.customer_name,
        customer.address
      );
      const res = await drive.files.create({
        requestBody: {
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [rootId],
        },
        fields: 'id',
        supportsAllDrives: true,
      });
      const newCid = res.data.id;
      if (!newCid) throw new Error('顧客フォルダID取得に失敗');
      customerFolderId = newCid;
      const curl = folderWebUrl(customerFolderId);
      const { error: upCustErr } = await admin
        .from('m_customers')
        .update({ drive_folder_id: customerFolderId, drive_folder_url: curl })
        .eq('id', customer.id);
      if (upCustErr) {
        console.error('[setup-project-drive] m_customers update', upCustErr);
      }
    }

    const projLabel = projectFolderLabel(
      row.project_number,
      row.work_type ?? [],
      row.work_description ?? '',
      row.customer_name
    );

    const projectFolderId = await findOrCreateChildFolder(drive, customerFolderId!, projLabel);

    for (const rel of templatePaths) {
      await ensureFolderPathFromTemplate(drive, projectFolderId, rel);
    }

    const pUrl = folderWebUrl(projectFolderId);
    const { error: upProjErr } = await admin
      .from('t_projects')
      .update({ drive_folder_id: projectFolderId, drive_folder_url: pUrl })
      .eq('id', row.id);

    if (upProjErr) {
      console.error('[setup-project-drive] t_projects update', upProjErr);
      return NextResponse.json(
        { success: false, error: 'Drive は作成済みですが Supabase 更新に失敗しました' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      customerFolderId,
      customerFolderUrl: folderWebUrl(customerFolderId!),
      projectFolderId,
      projectFolderUrl: pUrl,
    });
  } catch (e) {
    console.error('[setup-project-drive]', e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
