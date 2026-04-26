# ラパンリフォーム Mobile（スマートフォン版）

合同会社 中山塗装 / ラパンリフォーム の業務管理モバイルアプリ（Next.js + Supabase + LINE Login）

## 概要

現場作業員・営業担当者が外出先からスマートフォンで使用するPWAアプリケーションです。

## 機能一覧

| 機能 | 画面ID | 説明 |
|------|--------|------|
| 経費入力 | SCR-SP-001 | レシート撮影 → OCR → AI案件候補 → 登録 |
| 出退勤 | SCR-SP-002 | 出勤・退勤の打刻 |
| 日報 | SCR-SP-003 | 音声入力・AI文章整形対応の日報作成 |
| 現場写真 | SCR-SP-004 | カテゴリ別の現場写真アップロード |
| 履歴 | SCR-SP-005 | 経費データの一覧・フィルタリング |
| 集計 | SCR-SP-006 | 原価率テーブル・チャートによる集計 |
| 新規案件登録 | SCR-SP-007 | 新規案件登録 + LINE通知（権限制御付き） |

## 技術スタック

- **フレームワーク**: Next.js 15 (App Router)
- **言語**: TypeScript 5
- **スタイリング**: Tailwind CSS 3
- **状態管理**: Zustand 5
- **データフェッチ**: TanStack Query 5
- **DB**: Supabase (PostgreSQL + RLS)
- **認証**: LINE Login (LIFF SDK)
- **グラフ**: Chart.js 4
- **PWA**: Web App Manifest

## セットアップ

### 1. 依存関係インストール

```bash
npm install
```

### 2. 環境変数設定

```bash
cp .env.local.example .env.local
```

`.env.local` に以下を設定：

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...

NEXT_PUBLIC_LIFF_ID=1234567890-xxxxxxxx
NEXT_PUBLIC_LINE_LOGIN_CHANNEL_ID=1234567890

NEXT_PUBLIC_APP_URL=https://lapin-mobile.vercel.app
```

### 3. 開発サーバー起動

```bash
npm run dev
```

→ http://localhost:3001 で起動（PC版が3000を使用する場合）

### 4. ビルド

```bash
npm run build
npm start
```

## デモモード

LIFF IDが未設定の場合、自動的にデモモードで起動します。  
デモユーザー「山田太郎（営業）」でログインした状態でアプリを確認できます。

## デプロイ

Vercel へのデプロイ：

```bash
# Vercel CLIの場合
vercel deploy --prod
```

Vercel ダッシュボードから環境変数を設定してください。

## アーキテクチャ

```
スマホ（iPhone/Android/PWA）
    │ HTTPS
    ▼
Vercel（Next.js 15）
    │ supabase-js
    ▼
Supabase（PostgreSQL + RLS + Edge Functions）
    │
    ├── LINE Messaging API（通知）
    └── Google Drive（写真保存）
```

## 関連リポジトリ

- PC版: `lapin-reform-pc-supabase`（Vercel/Next.js）

## 更新履歴

| 日付 | バージョン | 内容 |
|------|-----------|------|
| 2026/04/27 | v1.0.0 | 初版作成（Supabase版） |
