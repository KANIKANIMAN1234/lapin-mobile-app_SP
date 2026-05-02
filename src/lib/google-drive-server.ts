import { Readable } from 'node:stream';
import { google, drive_v3 } from 'googleapis';

const FOLDER_MIME = 'application/vnd.google-apps.folder';

/** Drive フォルダ名に使えない文字を除去・長さ制限 */
export function sanitizeDriveSegment(name: string, maxLen = 180): string {
  const cleaned = name
    .replace(/[/\\:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length <= maxLen) return cleaned || '名称未設定';
  return cleaned.slice(0, maxLen - 1) + '…';
}

function getCredentials(): Record<string, unknown> | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw?.trim()) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function isDriveConfigured(): boolean {
  return !!getCredentials();
}

export function getDriveClient(): drive_v3.Drive | null {
  const credentials = getCredentials();
  if (!credentials) return null;
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return google.drive({ version: 'v3', auth });
}

async function createFolder(
  drive: drive_v3.Drive,
  name: string,
  parentId: string
): Promise<{ id: string }> {
  const safeName = sanitizeDriveSegment(name, 200);
  const res = await drive.files.create({
    requestBody: {
      name: safeName,
      mimeType: FOLDER_MIME,
      parents: [parentId],
    },
    fields: 'id',
    supportsAllDrives: true,
  });
  const id = res.data.id;
  if (!id) throw new Error('Driveフォルダ作成結果にIDがありません');
  return { id };
}

function escapeDriveQueryName(name: string): string {
  return name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/** 親の直下に同名フォルダがあればその ID、なければ作成 */
export async function findOrCreateChildFolder(
  drive: drive_v3.Drive,
  parentId: string,
  name: string
): Promise<string> {
  const safeName = sanitizeDriveSegment(name, 200);
  const q = `'${parentId}' in parents and name = '${escapeDriveQueryName(safeName)}' and mimeType = '${FOLDER_MIME}' and trashed = false`;
  const list = await drive.files.list({
    q,
    fields: 'files(id)',
    pageSize: 5,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  const existing = list.data.files?.[0]?.id;
  if (existing) return existing;
  const { id } = await createFolder(drive, safeName, parentId);
  return id;
}

/**
 * テンプレート1行（例: 03_施工写真/着工前）を親の下に再帰的に作り、末端フォルダIDを返す。
 * 既存の同名パーツは再利用する。
 */
export async function ensureFolderPathFromTemplate(
  drive: drive_v3.Drive,
  parentId: string,
  templateRelativePath: string
): Promise<string> {
  const segments = templateRelativePath
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);
  let current = parentId;
  for (const seg of segments) {
    current = await findOrCreateChildFolder(drive, current, seg);
  }
  return current;
}

export function folderWebUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`;
}

/** 案件フォルダ等に画像・ファイルを保存（メディアは Readable でアップロード） */
export async function uploadFileToDriveFolder(
  drive: drive_v3.Drive,
  parentFolderId: string,
  fileName: string,
  mimeType: string,
  buffer: Buffer
): Promise<{ id: string; webViewLink?: string | null }> {
  const safeName = sanitizeDriveSegment(fileName, 200);
  const res = await drive.files.create({
    requestBody: {
      name: safeName,
      parents: [parentFolderId],
    },
    media: {
      mimeType,
      body: Readable.from(buffer),
    },
    fields: 'id, webViewLink',
    supportsAllDrives: true,
  });
  const id = res.data.id;
  if (!id) throw new Error('Drive ファイルIDが取得できませんでした');
  return { id, webViewLink: res.data.webViewLink };
}

export function parseFolderTemplateJson(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
  } catch {
    return [];
  }
}
