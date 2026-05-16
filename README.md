# 受付・整理券システム

大規模イベント(来場者 1,000 人以上想定)向けの**受付と整理券管理を Web で完結させるシステム**。来場者はスマホで整理券を取得し、運営は QR スキャンで効率的に捌く。HMD(VR ヘッドセット)体験を含むブースを運営する想定。

## 主な特徴

- 📱 **スマホ完結**: 来場者は受付からアンケート回答までスマホブラウザで完了
- 🎫 **4 種類のブースタイプ**: 順次体験 / 同時並行 / 個人体験 / マッチメイキング(5 人対戦等)に対応
- 🛡️ **年齢ポリシー対応**: 7 歳以上、13 歳未満は保護者同意必須(HMD 体験のため)
- 🔔 **Web Push + 画面 polling**: 個人情報を取得せずに通知を実現
- 👥 **共有パスワード認証**: 運営の生徒スタッフが直感的に使える管理画面
- 📊 **CSV エクスポート**: 来場者・整理券・入場処理データを一括エクスポート

## 技術スタック

| レイヤー | 技術 |
|---|---|
| フロントエンド | Next.js (App Router), TypeScript, shadcn/ui |
| バックエンド | Go, `net/http`, Connect-RPC |
| データベース | PostgreSQL (Neon) |
| DB アクセス | sqlc + pgx |
| ストレージ | Cloudflare R2 (S3 互換) |
| 通知 | Web Push (VAPID) + 画面 polling |
| デプロイ | Google Cloud Run |
| API スキーマ | Protocol Buffers (buf) |

詳細は [`docs/spec/infrastructure.md`](docs/spec/infrastructure.md) を参照。

---

## 📚 ドキュメント構成

このリポジトリのドキュメントは、目的別に 3 つの階層に分かれています。

### 🤖 AI コーディングアシスタント向け

Claude Code 等が読み込むコーディング規約とシステム仕様。実装作業の前にこれらを参照することで、認識ずれを最小化する。

- **[`CLAUDE.md`](CLAUDE.md)** — プロジェクト概要・技術スタック・各ドキュメントへの参照(エントリポイント)

#### コーディング規約 ([`docs/coding/`](docs/coding/))

実装時に従うべきコーディング規約。設計思想に基づくルールを明文化。

| ファイル | 役割 |
|---|---|
| [`frontend.md`](docs/coding/frontend.md) | Next.js / TypeScript / 状態管理 / コンポーネント設計 |
| [`backend.md`](docs/coding/backend.md) | Go / Connect-RPC / sqlc / エラーハンドリング |
| [`shared.md`](docs/coding/shared.md) | コメント方針 / テスト戦略 / ロギング / PII 取扱 |
| [`cli.md`](docs/coding/cli.md) | Go の CLI / データ処理ツール開発 |
| [`checklist.md`](docs/coding/checklist.md) | コミット前のセルフレビューチェックリスト |

#### システム仕様 ([`docs/spec/`](docs/spec/))

このシステムの振る舞いを定義する仕様書。実装の根拠となる文書群。

| ファイル | 役割 |
|---|---|
| [`overview.md`](docs/spec/overview.md) | プロダクト概要・ユーザー像・スコープ・年齢ポリシー |
| [`domain.md`](docs/spec/domain.md) | 用語定義・エンティティ・業務ルール(R-001〜R-020) |
| [`data-model.md`](docs/spec/data-model.md) | DB スキーマ詳細・ER 図・インデックス設計 |
| [`infrastructure.md`](docs/spec/infrastructure.md) | インフラ構成・環境変数・デプロイ手順 |

##### 機能仕様 ([`docs/spec/features/`](docs/spec/features/))

| ファイル | 役割 |
|---|---|
| [`auth.md`](docs/spec/features/auth.md) | 受付・認証・Web Push 購読登録 |
| [`ticket.md`](docs/spec/features/ticket.md) | 整理券予約・管理(4 タイプ・年齢分岐・クールダウン・pending) |
| [`match.md`](docs/spec/features/match.md) | マッチメイキング型ブース固有のロジック(5 人対戦等) |
| [`admin.md`](docs/spec/features/admin.md) | 管理者画面・特殊フロー手動発行・全体管理者機能 |
| [`notification.md`](docs/spec/features/notification.md) | Web Push 通知・画面 polling・テンプレート管理 |

### 👥 運営者向け

イベント当日の運営手順。Claude Code の参照対象には含めない、運営担当者が直接読むドキュメント。

- **[`docs/operation/README.md`](docs/operation/README.md)** — 整備予定の運営マニュアル一覧

(各マニュアルは実装の進行と並行して整備)

---

## 🚀 開発を始める

### 前提

- Go 1.22+
- Node.js 20+
- Docker(ローカル DB 起動用)
- buf CLI(`brew install bufbuild/buf/buf` 等)
- Cloud Run / Neon / Cloudflare R2 のアカウント(本番デプロイ時)

### セットアップ

```bash
# リポジトリ取得
git clone <repository-url>
cd <repository-name>

# 環境変数の設定
cp .env.example .env.local
# .env.local を編集

# DB 起動(ローカル開発)
docker compose up -d

# proto から Go / TS のコード生成
buf generate

# バックエンド
cd backend
go mod download
migrate -path ./migrations -database "$DATABASE_URL" up
go run cmd/server/main.go

# フロントエンド(別ターミナル)
cd frontend
npm install
npm run dev
```

詳細な手順は [`docs/spec/infrastructure.md`](docs/spec/infrastructure.md) を参照。

### 実装作業の流れ

新しい機能を実装するときの標準フロー(Claude Code 利用想定):

1. **仕様確認**: 該当する `docs/spec/features/<機能>.md` を読む
2. **計画提示**: Claude Code に `@docs/coding/<関連>.md` と `@docs/spec/features/<機能>.md` を参照させ、実装計画を提示してもらう
3. **proto / マイグレーション**: 必要なら API 契約・DB スキーマを更新
4. **実装**: 重要箇所は TDD、その他はアフター
5. **セルフレビュー**: [`docs/coding/checklist.md`](docs/coding/checklist.md) で確認
6. **コミット**: Conventional Commits 形式

詳細は [`CLAUDE.md`](CLAUDE.md) の「9. 開発の標準フロー」参照。

---

## 🔑 重要な設計判断

このシステムは以下の判断に基づいて設計されています。詳細は [`docs/spec/`](docs/spec/) 配下のドキュメントを参照。

### 個人情報を取得しない

メール・本名・住所・電話番号等は一切取得せず、来場者の識別はニックネーム + 受付番号 + PIN のみで行う。これにより:

- PII 保管リスクを最小化
- データ削除の運用が単純化
- 通知は Web Push(VAPID)のみ(LINE/メールは MVP 外)

詳細: [`domain.md`](docs/spec/domain.md) の R-019

### 年齢ポリシー(HMD 体験のため)

| 年齢 | 受付方式 |
|---|---|
| 7 歳未満 | 受付不可 |
| 7〜9 歳 | スタッフ介在の特殊フロー(紙 + デジタル併用) |
| 10〜12 歳 | オンライン受付可、保護者同伴 + デジタル同意必須 |
| 13 歳以上 | オンライン受付可、本人同意のみ |

詳細: [`domain.md`](docs/spec/domain.md) の R-005

### 4 つのブース体験タイプ

ブースは以下のいずれか:

- `sequential` — 順次体験(HMD 1 台で家族 4 人が順次)
- `parallel` — 同時並行(HMD 複数台で同時)
- `individual` — 個人体験(1 整理券 1 人)
- `matchmaking` — マッチメイキング型(5 人対戦ゲーム等)

詳細: [`ticket.md`](docs/spec/features/ticket.md), [`match.md`](docs/spec/features/match.md)

### pending 状態(遅刻に寛容)

呼び出し後 N 分経過で自動失効ではなく `pending` 状態に保留。来場者が後から戻ってきたら**優先呼び出し**で処理。「他の人を待たせず、遅刻者にも体験させる」設計。

詳細: [`domain.md`](docs/spec/domain.md) の R-012, R-013

### スタッフ認証(共有パスワード方式)

ブースごとに共有パスワードを発行。個人を特定せず、ブース粒度の操作ログのみ残す。運用シンプル最優先。全体管理者は別ルート。

詳細: [`domain.md`](docs/spec/domain.md) の R-011, [`admin.md`](docs/spec/features/admin.md)

---

## 📐 アーキテクチャ概観

```
[ 来場者ブラウザ (PC/スマホ) ] [ 管理者ブラウザ (タブレット) ]
                ↓ HTTPS
        ┌───────────────────────┐
        │ Cloud Run (frontend)    │
        │   Next.js (App Router)  │
        │   Service Worker        │
        └───────────────────────┘
                ↓ Connect-RPC over HTTPS
        ┌───────────────────────┐
        │ Cloud Run (backend)     │
        │   Go + net/http         │
        │   Connect-RPC handlers  │
        │   sqlc + pgx            │
        │   Web Push 送信         │
        └───────────────────────┘
                ↓                        ↓
        ┌──────────────┐        ┌──────────────┐
        │ Neon          │        │ Cloudflare R2 │
        │ PostgreSQL    │        │ (画像)         │
        └──────────────┘        └──────────────┘

外部連携:
  - YouTube (動画埋め込み URL のみ)
  - Google Forms (アンケート、外部リンク)
  - Push Service (VAPID 経由でブラウザに送信)
```

詳細: [`infrastructure.md`](docs/spec/infrastructure.md)

---

## 📊 ドキュメントの規模

| カテゴリ | ファイル数 | 行数 |
|---|---:|---:|
| コーディング規約 | 5 | (別途管理) |
| システム仕様(全体) | 4 | 約 1,400 行 |
| 機能仕様 | 5 | 約 1,600 行 |
| 運営マニュアル | 1(整備予定) | - |

---

## 🗺️ ロードマップ

### MVP(初期リリース対象)

- [x] 仕様書の作成
- [x] proto 定義
- [x] DB マイグレーション
- [x] バックエンド: 認証・整理券取得・呼び出し・入場処理
- [x] バックエンド: マッチメイキング・通知
- [x] フロントエンド: 受付・ブース一覧・整理券詳細
- [x] フロントエンド: 管理画面・QR スキャナー
- [x] Web Push 実装
- [x] E2E テスト(主要動線 5〜10 シナリオ)
- [x] 本番デプロイ

### v2 以降で検討

- LINE 連携(LINE Messaging API)
- 体験後の自動アンケート画面切り替え
- 待ち時間の自動グラフ化・統計分析
- スタッフの個人アカウント方式
- 多言語対応(英語等)
- アクセシビリティ強化(WCAG レベル A)

---

## 🤝 コントリビューション

このプロジェクトは主に 1 人で開発していますが、PR レビュー時等は以下を意識してください。

1. [`CLAUDE.md`](CLAUDE.md) の「アンチパターン」に該当しないか
2. [`docs/coding/checklist.md`](docs/coding/checklist.md) のセルフレビュー項目を通過しているか
3. 設計思想(堅牢さ > 可読性 > 拡張性 > 開発速度)と整合しているか

---

## 📄 ライセンス

(TBD)

---

## ⚠️ 重要事項

- **HMD 体験は健康面の配慮が必要**です。本システムは運営の善管注意義務を補助する位置づけで、対面でのスタッフによるリスク説明と装着支援を前提としています
- **個人情報は最小化**しています(メール・本名等は取得しない)が、保護者同意の記録には IP アドレス・User Agent 等が含まれます
- **イベント当日の障害対応**として、紙の整理券への切替手順を運営マニュアル側で整備する想定です
