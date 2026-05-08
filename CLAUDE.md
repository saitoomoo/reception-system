# Project Overview & Conventions

このドキュメントは、本プロジェクト固有の概要・技術スタック・規約への参照をまとめたものです。全プロジェクト共通の設計思想と AI 協働ルールは `~/.claude/CLAUDE.md` を参照してください。

---

## 1. プロジェクト概要

> **このセクションはプロジェクトごとに書き換えてください。**

- **種別**: フルスタック Web アプリケーション
- **概要**: <ここにプロジェクトの目的・対象ユーザーを書く>
- **特徴**: Figma Make で生成した UI を React/Next.js プロジェクトにインポートし、画面単位で再構成する開発フローを採用

---

## 2. 技術スタック

### フロントエンド

- **言語**: TypeScript
- **フレームワーク**: Next.js (App Router)
- **UI ライブラリ**: shadcn/ui
- **状態管理**:
  - サーバー状態: TanStack Query + connect-query
  - グローバル UI 状態: React Context(静的)・Zustand(動的)
  - フォーム状態: React Hook Form + Zod
- **デザインソース**: Figma Make → 画面単位で取り込み

### バックエンド

- **言語**: Go
- **HTTP**: 標準ライブラリの `net/http`(Go 1.22+ の強化版 ServeMux)
- **API**: Connect-RPC(buf + connect-go)
- **DB アクセス**: `sqlc` + `pgx`
- **ロギング**: `log/slog`(標準ライブラリ)

### データベース

- PostgreSQL

### 共通

- **API スキーマ**: Protocol Buffers(`buf` でビルド)
- **コード生成**: `protoc-gen-go`, `protoc-gen-connect-go`, `protoc-gen-es`, `protoc-gen-connect-es`

---

## 3. 開発体制とフェーズ

- **開発体制**: 主に一人開発、たまにレビューが入る
- **フェーズ**: MVP(初期リリース前。動く + ある程度の品質)
- **方針への影響**: 自分以外も読めるコード品質は必要だが、本番運用級の堅牢性は過剰

---

## 4. ディレクトリ構成(全体像)

```
.
├── CLAUDE.md                     # このファイル
├── docs/coding/
│   ├── frontend.md               # フロントエンド規約
│   ├── backend.md                # バックエンド規約
│   └── shared.md                 # 共通規約(コメント、テスト、ロギング、PII 等)
├── proto/                        # Protocol Buffers 定義(API 契約の真実の源)
├── gen/                          # proto から生成したコード(手動編集禁止)
│   ├── go/
│   └── ts/
├── frontend/                     # Next.js プロジェクト
│   ├── app/
│   ├── features/
│   ├── components/
│   ├── lib/
│   └── hooks/
└── backend/                      # Go プロジェクト
    ├── cmd/server/
    ├── internal/
    │   ├── feature/              # 機能別ディレクトリ
    │   └── pkg/                  # 共通基盤(該当規模になったら)
    └── go.mod
```

---

## 5. 詳細規約への参照

実装作業のときは、対象に応じて以下のドキュメントを参照してください。

- **フロントエンドの作業**: @docs/coding/frontend.md
- **バックエンドの作業**: @docs/coding/backend.md
- **共通の作業(命名・コメント・テスト全体・ログ)**: @docs/coding/shared.md
- **CLI / データ処理ツールの作業**: @docs/coding/cli.md
- **コミット前のセルフレビュー**: @docs/coding/checklist.md

---

## 6. プロジェクト固有のアンチパターン

(普遍的なアンチパターンは `~/.claude/CLAUDE.md` を参照)

### このプロジェクト固有で禁止

- `gen/` 配下の生成物の手動編集
- `proto/` ファイルを変更せずに API のレスポンス構造を変える
- Server Component の中で React hooks を呼ぶ
- Server Component を Client Component の子として配置する(children 経由は OK)
- Connect エラーを repository / service が直接返す
- handler が repository を飛び越えて DB に直接アクセスする
- Go の handler / repository 以外で sqlc 生成型に依存する
- `any` の使用(`unknown` を使う)

---

## 7. このプロジェクトでの開発フローの特殊事情

### Figma Make から取り込んだ画面の分離手順

1. Figma Make が生成した `App.tsx` を読み込む
2. 各画面ごとに `app/<route>/page.tsx` に分離
3. その画面でしか使わない子コンポーネントは `app/<route>/_components/` へ
4. 既に存在する汎用 UI(Button 等)と重複するものは `components/ui/` の既存実装に置き換える
5. 重複していなくても、複数画面で使う想定のものは `components/ui/` に切り出す

詳細な配置ルールは @docs/coding/frontend.md を参照。
