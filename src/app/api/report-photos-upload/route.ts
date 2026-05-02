import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  findOrCreateChildFolder,
  getDriveClient,
  isDriveConfigured,
  sanitizeDriveSegment,
  uploadFileToDriveFolder,
} from '@/lib/google-drive-server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_FILES = 5;
const MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  '',
]);

const REPORT_PHOTOS_BUCKET = 'report-photos';

type FileItem = { buf: Buffer; mime: string };

function createAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase server env が不足しています');
  return createClient(url, key);
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

function extFromMime(mime: string): string {
  const m = (mime || '').toLowerCase();
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  if (m.includes('heic') || m.includes('heif')) return 'heic';
  return 'jpg';
}

/** PC の現場写真と同様、img タグで表示しやすい直リンク */
function driveImagePublicUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=view&id=${fileId}`;
}

/** サービスアカウントの「マイドライブに保管枠が無い」系エラー（共有ドライブ未使用時によく出る） */
function isServiceAccountStorageQuotaError(err: unknown): boolean {
  let cur: unknown = err;
  for (let d = 0; d < 4 && cur; d++) {
    const msg = cur instanceof Error ? cur.message : String(cur);
    if (/Service Accounts do not have storage quota/i.test(msg)) return true;
    if (/storage quota/i.test(msg)) return true;
    const g = cur as { errors?: { reason?: string }[] };
    if (Array.isArray(g.errors) && g.errors.some((e) => e.reason === 'storageQuotaExceeded')) return true;
    cur = cur instanceof Error && cur.cause ? cur.cause : null;
  }
  return false;
}

async function uploadToSupabaseReportBucket(
  admin: SupabaseClient,
  userId: string,
  dateSlug: string,
  items: FileItem[],
): Promise<string[]> {
  const urls: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const { buf, mime } = items[i];
    const ext = extFromMime(mime);
    const path = `${userId}/reports/${dateSlug}_${Date.now()}_${i}.${ext}`;
    const { error } = await admin.storage.from(REPORT_PHOTOS_BUCKET).upload(path, buf, {
      contentType: mime,
      upsert: false,
    });
    if (error) throw error;
    const { data } = admin.storage.from(REPORT_PHOTOS_BUCKET).getPublicUrl(path);
    urls.push(data.publicUrl);
  }
  return urls;
}

async function uploadItemsToDriveNippouFolder(
  drive: NonNullable<ReturnType<typeof getDriveClient>>,
  nippouFolderId: string,
  dateSlug: string,
  items: FileItem[],
): Promise<string[]> {
  const urls: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const { buf, mime } = items[i];
    const ext = extFromMime(mime);
    const baseName = sanitizeDriveSegment(`日報_${dateSlug}_${i + 1}.${ext}`, 200);
    const uploaded = await uploadFileToDriveFolder(drive, nippouFolderId, baseName, mime, buf);
    urls.push(driveImagePublicUrl(uploaded.id));
  }
  return urls;
}

/**
 * FormData: projectId, reportDate (YYYY-MM-DD 推奨), file × N（画像）
 * → 優先: 案件 Drive 内の「日報」フォルダ。SA の保管枠エラー時は Supabase Storage report-photos にフォールバック。
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await getBearerUserId(req);
    if (!userId) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const form = await req.formData();
    const projectId = String(form.get('projectId') ?? '').trim();
    const reportDateRaw = String(form.get('reportDate') ?? '').trim();
    const files = form
      .getAll('file')
      .filter((x): x is File => x instanceof File && x.size > 0);

    if (!projectId) {
      return NextResponse.json({ success: false, error: 'projectId が必要です' }, { status: 400 });
    }
    if (files.length === 0) {
      return NextResponse.json({ success: false, error: '画像ファイルがありません' }, { status: 400 });
    }
    if (files.length > MAX_FILES) {
      return NextResponse.json({ success: false, error: `画像は最大${MAX_FILES}枚までです` }, { status: 400 });
    }

    for (const f of files) {
      if (f.size > MAX_BYTES) {
        return NextResponse.json({ success: false, error: '1枚あたり最大5MBまでです' }, { status: 400 });
      }
      const mime = (f.type || '').toLowerCase();
      if (mime && !ALLOWED_MIME.has(mime)) {
        return NextResponse.json({ success: false, error: `未対応の画像形式です: ${mime}` }, { status: 400 });
      }
    }

    const admin = createAdmin();

    const { data: row, error: selErr } = await admin
      .from('t_projects')
      .select('id, drive_folder_id, created_by, assigned_to')
      .eq('id', projectId)
      .is('deleted_at', null)
      .maybeSingle();

    if (selErr || !row) {
      return NextResponse.json({ success: false, error: '案件が見つかりません' }, { status: 404 });
    }

    const ok = await assertCanAccessProject(admin, userId, {
      created_by: row.created_by as string | null,
      assigned_to: row.assigned_to as string,
    });
    if (!ok) {
      return NextResponse.json({ success: false, error: 'この案件への操作権限がありません' }, { status: 403 });
    }

    const dateSlug = /^\d{4}-\d{2}-\d{2}$/.test(reportDateRaw)
      ? reportDateRaw.replace(/-/g, '')
      : new Date()
          .toISOString()
          .slice(0, 10)
          .replace(/-/g, '');

    const items: FileItem[] = [];
    for (const f of files) {
      const buf = Buffer.from(await f.arrayBuffer());
      const mime = (f.type || 'image/jpeg').toLowerCase() || 'image/jpeg';
      items.push({ buf, mime });
    }

    const parentDriveId = (row.drive_folder_id as string | null)?.trim();
    if (!parentDriveId) {
      return NextResponse.json(
        {
          success: false,
          error:
            '案件の Google Drive フォルダが未設定です。案件作成時の Drive 連携を完了してから再度お試しください。',
        },
        { status: 400 }
      );
    }

    const driveReady = isDriveConfigured() && !!getDriveClient();

    if (!driveReady) {
      const urls = await uploadToSupabaseReportBucket(admin, userId, dateSlug, items);
      return NextResponse.json({ success: true, urls, storageFallback: true });
    }

    const drive = getDriveClient()!;

    try {
      const nippouFolderId = await findOrCreateChildFolder(drive, parentDriveId, '日報');
      const urls = await uploadItemsToDriveNippouFolder(drive, nippouFolderId, dateSlug, items);
      return NextResponse.json({ success: true, urls, storageFallback: false });
    } catch (e) {
      if (isServiceAccountStorageQuotaError(e)) {
        console.warn(
          '[report-photos-upload] Google Drive に保存できませんでした（サービスアカウントの保管枠など）。Supabase Storage にフォールバックします。',
          e
        );
        const urls = await uploadToSupabaseReportBucket(admin, userId, dateSlug, items);
        return NextResponse.json({ success: true, urls, storageFallback: true });
      }
      throw e;
    }
  } catch (e) {
    console.error('[report-photos-upload]', e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
