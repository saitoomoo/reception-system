# Project Overview & Conventions

このドキュメントは、本プロジェクト固有の概要・技術スタック・規約への参照をまとめたものです。全プロジェクト共通の設計思想と AI 協働ルールは `~/.claude/CLAUDE.md` を参照してください。

---

## 1. プロジェクト概要

- **種別**: 大規模イベント向けフルスタック Web アプリケーション
- **概要**: イベント来場者(1,000 人以上想定)の受付と整理券管理を Web で完結させるシステム。HMD(VR ヘッドセット)体験を含むブースを運営する
- **特徴**:
  - 来場者はスマホブラウザから整理券を取得・順番確認
  - 運営スタッフ(生徒)はタブレット等で QR スキャン入場処理
  - HMD 体験のため、年齢ポリシー(7 歳以上、13 歳未満は保護者同意)を厳格に運用
  - Figma Make で生成した UI を React/Next.js プロジェクトにインポートし、画面単位で再構成する開発フローを採用

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
- **通知**: Service Worker + Web Push API + 画面 polling のハイブリッド

### バックエンド

- **言語**: Go (1.22 以降)
- **HTTP**: 標準ライブラリの `net/http`(Go 1.22+ の強化版 ServeMux)
- **API**: Connect-RPC(buf + connect-go)
- **DB アクセス**: `sqlc` + `pgx`
- **ロギング**: `log/slog`(標準ライブラリ)
- **Web Push 送信**: `github.com/SherClockHolmes/webpush-go`
- **ストレージ SDK**: AWS SDK for Go v2(S3 互換 API)

### データベース

- **DB**: PostgreSQL(Neon サーバーレス)
- **マイグレーション**: `golang-migrate/migrate` または `pressly/goose`

### 共通

- **API スキーマ**: Protocol Buffers(`buf` でビルド)
- **コード生成**: `protoc-gen-go`, `protoc-gen-connect-go`, `protoc-gen-es`, `protoc-gen-connect-es`

### インフラ

- **デプロイ先**: Google Cloud Run(フロント・バック両方)
- **DB ホスティング**: Neon(PostgreSQL サーバーレス)
- **メディアストレージ**: Cloudflare R2(S3 互換 API、GCS にも切替可能な実装)
- **動画ホスティング**: YouTube 限定公開埋め込み
- **アンケート**: Google Forms(外部リンク)
- **通知**: Web Push (VAPID)

詳細は `docs/spec/infrastructure.md` を参照。

---

## 3. 開発体制とフェーズ

- **開発体制**: 主に一人開発、たまにレビューが入る
- **フェーズ**: MVP(初期リリース前。動く + ある程度の品質)
- **方針への影響**: 自分以外も読めるコード品質は必要だが、本番運用級の堅牢性は過剰

---

## 4. ディレクトリ構成(全体像)

```
.
├── README.md                     # リポジトリ全体のナビゲーション
├── CLAUDE.md                     # このファイル
├── docs/
│   ├── coding/                   # コーディング規約(Claude Code 向け)
│   │   ├── frontend.md
│   │   ├── backend.md
│   │   ├── shared.md
│   │   ├── cli.md
│   │   └── checklist.md
│   ├── spec/                     # システム仕様(Claude Code 向け)
│   │   ├── overview.md
│   │   ├── domain.md
│   │   ├── data-model.md
│   │   ├── infrastructure.md
│   │   └── features/
│   │       ├── auth.md
│   │       ├── ticket.md
│   │       ├── match.md
│   │       ├── admin.md
│   │       └── notification.md
│   └── operation/                # 運営マニュアル(運営者向け、随時整備)
│       └── README.md
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
├── backend/                      # Go プロジェクト
│   ├── cmd/server/
│   ├── internal/
│   │   ├── feature/              # 機能別ディレクトリ
│   │   │   ├── visitor/
│   │   │   ├── ticket/
│   │   │   ├── match/
│   │   │   ├── booth/
│   │   │   ├── admission/
│   │   │   ├── notification/
│   │   │   └── admin/
│   │   └── pkg/                  # 共通基盤
│   │       ├── auth/
│   │       ├── middleware/
│   │       ├── db/
│   │       ├── connecterr/
│   │       ├── storage/          # R2/S3 互換クライアント
│   │       └── webpush/          # Web Push 送信
│   ├── migrations/               # DB マイグレーション SQL
│   ├── queries/                  # sqlc 用 SQL クエリ
│   ├── sqlc.yaml
│   └── go.mod
├── buf.yaml                      # buf 設定
├── buf.gen.yaml                  # 生成設定
├── docker-compose.yml            # ローカル開発用(PostgreSQL 等)
├── .env.example                  # 環境変数テンプレート
└── .gitignore
```

---

## 5. 詳細規約への参照

実装作業のときは、対象に応じて以下のドキュメントを参照してください。

### コーディング規約

- フロントエンド: @docs/coding/frontend.md
- バックエンド: @docs/coding/backend.md
- 共通(命名・コメント・テスト・ロギング・PII): @docs/coding/shared.md
- CLI / データ処理: @docs/coding/cli.md
- セルフレビューチェックリスト: @docs/coding/checklist.md

### プロダクト仕様

- 概要・ユーザー像・スコープ: @docs/spec/overview.md
- ドメインモデル・業務ルール: @docs/spec/domain.md
- データモデル(DB スキーマ): @docs/spec/data-model.md
- インフラ構成・環境変数: @docs/spec/infrastructure.md

### 機能仕様

- 受付・認証: @docs/spec/features/auth.md
- 整理券予約・管理: @docs/spec/features/ticket.md
- マッチメイキング型ブース: @docs/spec/features/match.md
- 管理者画面: @docs/spec/features/admin.md
- 通知(Web Push): @docs/spec/features/notification.md

---

## 6. このプロジェクト固有の重要ルール

### R-1. プロダクトの性質

- **HMD 体験を含むため、年齢配慮が必須**
- 7 歳以上のみ受付可、7〜9 歳はスタッフ介在の特殊フロー、10〜12 歳は保護者同伴 + デジタル同意必須
- 個人情報(メール・本名・住所等)は一切取得しない

### R-2. 真実の源(Single Source of Truth)

- API 契約: `proto/` ファイル
- DB スキーマ: `migrations/` のマイグレーション SQL
- 業務ルール: `docs/spec/domain.md` の R-001〜R-020

これらが食い違ったら、規約に従い**事前確認**を行ってから修正する(変更困難な領域)。

### R-3. 4 つの体験タイプ

ブースは以下の 4 タイプのいずれか:
- `sequential`(順次体験型)
- `parallel`(同時並行型)
- `individual`(個人体験型)
- `matchmaking`(マッチメイキング型 = 5 人対戦ゲーム等)

タイプごとに整理券の挙動が異なる。詳細は `domain.md` の R-015 と各機能ドキュメント参照。

### R-4. 状態遷移

整理券の状態は 5 種類:
- `waiting` → `called` → `admitted`(通常フロー)
- `called` → `pending`(No Show、N 分経過で自動)
- `pending` → `called`(復帰時、優先付き)
- 任意状態 → `cancelled`(キャンセル時)

詳細は `domain.md` の状態遷移図と `ticket.md` 参照。

### R-5. 通知方式

Web Push + 画面 polling のハイブリッド。メール・LINE は MVP に含まない。詳細は `notification.md`。

### R-6. スタッフ認証

ブースごとの共有パスワード方式。個人特定はしない。全体管理者は別ルート。詳細は `admin.md`。

---

## 7. プロジェクト固有のアンチパターン

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
- メールアドレスや個人情報をシステムで取得・保存する
- `participants.name`, `parental_consents.guardian_name`, `ip_address` 等の PII をログに出す
- Push エンドポイント URL をマスクなしでログに出す
- `tickets` の状態遷移ルール(R-014 等)に反する変更
- 7 歳未満の整理券を発行する処理(必ずバリデーションで弾く)
- 13 歳未満の整理券で保護者同意なしの発行
- ブース設定の `experience_type` に新しいタイプを勝手に追加(必ず事前確認)

---

## 8. このプロジェクトでの開発フローの特殊事情

### 8-1. Figma Make から取り込んだ画面の分離手順

1. Figma Make が生成した `App.tsx` を読み込む
2. 各画面ごとに `frontend/app/<route>/page.tsx` に分離
3. その画面でしか使わない子コンポーネントは `frontend/app/<route>/_components/` へ
4. 既に存在する汎用 UI(Button 等)と重複するものは `frontend/components/ui/` の既存実装に置き換える
5. 重複していなくても、複数画面で使う想定のものは `frontend/components/ui/` に切り出す

詳細な配置ルールは @docs/coding/frontend.md を参照。

### 8-2. proto 変更時の手順

1. `proto/` のファイルを編集
2. `buf generate` で `gen/` を再生成
3. 生成後の Go / TS の型を確認
4. 影響を受ける handler / repository / フロント呼び出し箇所を更新
5. テストを実行
6. proto 変更は「変更困難な領域」なので、必ず計画を提示してから着手

### 8-3. マイグレーション追加時の手順

1. 計画を提示(`data-model.md` との整合性を確認)
2. `migrations/<連番>_<説明>.up.sql` と `<連番>_<説明>.down.sql` を作成
3. ローカル DB で適用テスト
4. ロールバックテスト
5. sqlc 用のクエリ(`queries/`)を更新
6. `sqlc generate` で Go コードを再生成

### 8-4. Web Push の実装時の注意

- VAPID 鍵はサーバー側でのみ秘密鍵を持つ。フロントには公開鍵のみ
- Service Worker は `frontend/public/sw.js` に配置
- iOS Safari では PWA インストール前提でしか動作しない → 画面 polling フォールバック必須
- 配信失敗時の retry / subscription 削除ロジックを忘れない

---

## 9. 開発の標準フロー

新しい機能を実装する際の標準的な手順:

1. **計画提示**: 変更内容・規約適用・テスト方針を整理して共有
2. **proto 定義**: 必要な RPC を `proto/` に定義(API 契約)
3. **マイグレーション**: 必要なら `migrations/` に追加
4. **sqlc クエリ**: `queries/` に SQL を追加、`sqlc generate`
5. **バックエンド実装**:
   - repository 実装(sqlc 生成物のラッパー)
   - service 実装(必要な場合のみ、3 層化条件は backend.md 参照)
   - handler 実装(Connect エラー変換、PII ログ除外)
6. **フロントエンド実装**:
   - 必要なら state 管理の選択判断(decision tree)
   - Server / Client Component の判断
   - 各画面・コンポーネントの実装
7. **テスト**:
   - 重要箇所: TDD(認証・整理券取得・状態遷移・マッチング・特殊フロー手動発行)
   - その他: アフター
8. **チェックリスト**: `docs/coding/checklist.md` でセルフレビュー
9. **コミット**: Conventional Commits 形式

---

## 10. 未決定事項のステータス

仕様書全体の未決定事項は、各 spec ドキュメントの末尾「未決定事項」セクションに集約されています。

主な未決定事項:

- データ保持期間(イベント終了後の削除タイミング)
- API レート制限・PIN 試行制限
- マッチメイキング固有のエッジケース(M-1〜M-5、`features/match.md` 参照)
- 利用規約・プライバシーポリシーの文面
- カスタムドメイン取得・SLA 目標

実装中盤までに決める想定。
