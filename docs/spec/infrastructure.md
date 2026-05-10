# インフラストラクチャ

Cloud Run + Neon + Cloudflare R2 + Web Push の構成詳細。実装時に環境変数や接続設定を参照するためのリファレンス。

---

## 1. 全体構成

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
        │ PostgreSQL    │        │ (画像ストレージ)│
        └──────────────┘        └──────────────┘

                ←→ 外部連携
                  ┌───────────────┐
                  │ YouTube       │  動画埋め込み(URL のみ)
                  │ Google Forms  │  アンケート(外部リンク)
                  │ Push サービス  │  Web Push (VAPID 経由)
                  └───────────────┘
```

---

## 2. 各サービスの選定理由

### Cloud Run(GCP)

- リクエスト時間に応じた課金。リクエストがない時はゼロ課金
- イベント前日まで実質無料
- イベント当日の 10,000 人アクセスで自動スケール
- イベント終了後はアイドル状態で課金最小
- Go と Next.js 両方をコンテナで動かせる

### Neon(サーバーレス PostgreSQL)

- 無料枠が広い(10 GB ストレージ程度)
- Cloud Run と組み合わせやすい
- アイドル時にコンピュートが落ちる(コスト最小)
- 通常の PostgreSQL 互換、sqlc + pgx でそのまま使える

### Cloudflare R2

- ストレージ 10 GB まで無料
- **Egress 無料**(画像配信のコストが読みやすい)
- S3 互換 API なので、必要に応じて GCS 等に切替可能
- AWS SDK v2 でアクセス可能

### Web Push(VAPID)

- 個人情報(メアド、LINE userId)が不要
- 外部サービスへの依存なし(Push サービスはブラウザ依存)
- VAPID 鍵の管理のみ自前

### YouTube 限定公開

- 動画ホスティングのコスト・帯域が不要
- 配信品質が最高(YouTube CDN)
- 管理画面では URL を保存するだけ

### Google Forms

- アンケート機能の実装コスト最小
- 集計は Google Sheets で完結
- 運営者(生徒)の習熟度が高い可能性

---

## 3. 環境変数

### バックエンド(Go)

```
# サーバー設定
APP_ENV=production            # production / development / test
PORT=8080
LOG_LEVEL=info                # debug / info / warn / error

# データベース(Neon)
DATABASE_URL=postgres://user:pass@ep-xxx.neon.tech/eventdb?sslmode=require

# ストレージ(Cloudflare R2)
STORAGE_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
STORAGE_BUCKET=event-media
STORAGE_ACCESS_KEY_ID=xxx
STORAGE_SECRET_ACCESS_KEY=xxx
STORAGE_PUBLIC_URL=https://media.event.example.com  # CDN またはカスタムドメイン

# Web Push (VAPID)
VAPID_PUBLIC_KEY=BN...        # フロントにも公開する
VAPID_PRIVATE_KEY=xxx
VAPID_SUBJECT=mailto:admin@event.example.com

# 認証
GLOBAL_ADMIN_PIN_SECRET=xxx   # bcrypt のソルトとは別の Pepper として使用
SESSION_SECRET=xxx            # クッキーセッションの署名用

# 受付番号採番(オプション)
RECEPTION_NUMBER_PREFIX_START=A  # 通常 A から開始
```

### フロントエンド(Next.js)

```
# 環境設定
NODE_ENV=production
NEXT_PUBLIC_APP_ENV=production

# Connect-RPC 接続先
NEXT_PUBLIC_API_URL=https://api.event.example.com

# Web Push (VAPID 公開鍵)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BN...

# サイト全体
NEXT_PUBLIC_SITE_NAME=○○イベント
NEXT_PUBLIC_SITE_URL=https://event.example.com

# Sentry 等の監視(将来導入時)
# NEXT_PUBLIC_SENTRY_DSN=
```

### 環境変数の管理

- ローカル開発: `.env.local` に記述、`.gitignore` で除外
- 本番: Cloud Run のシークレット機能を使用
- `NEXT_PUBLIC_*` プレフィックスがついたものはブラウザに公開される(VAPID 公開鍵のみ)
- それ以外は絶対に公開しない

---

## 4. ストレージ(R2)の運用

### バケット構造

```
event-media/                    -- ルートバケット
├── booths/
│   ├── {booth_id}/
│   │   ├── cover.jpg           -- ブースカバー画像
│   │   └── intro-{n}.jpg       -- 紹介画像(複数可)
└── notifications/
    └── icons/
        └── {key}.png           -- 通知アイコン
```

### アップロードフロー

1. 管理者が管理画面で画像を選択
2. フロントから Go バックエンドに HTTP POST(画像バイナリ含む)
3. Go バックエンドが R2 に保存(AWS SDK v2 の S3 クライアント)
4. R2 から得られた Public URL を `booths.cover_image_url` 等に保存
5. 管理画面に反映

> **将来検討**: 署名付き PUT URL を使ってフロントから直接アップロードする方式(Go バックエンドの帯域節約)

### 配信ポリシー

- ブース画像は **公開**(認証不要で閲覧可能)
- カスタムドメインを CDN として設定する(Cloudflare の機能)
- キャッシュ TTL: 1 時間以上(画像は頻繁に変わらない前提)

### 画像のバリデーション

アップロード時の検証(Go 側で実施):

- ファイル形式: JPEG / PNG / WebP のみ
- ファイルサイズ: 5 MB 以下
- 画像サイズ: 横 4096px 以下、縦 4096px 以下
- 必要に応じて Go 側でリサイズ(将来課題)

---

## 5. データベース(Neon)の運用

### 接続文字列

```
postgres://USER:PASSWORD@ep-xxxx.region.aws.neon.tech/DBNAME?sslmode=require
```

### 接続プール

Neon は内蔵のコネクションプーラーを提供。

```
postgres://USER:PASSWORD@ep-xxxx-pooler.region.aws.neon.tech/DBNAME?sslmode=require
```

Cloud Run のような短命なリクエストハンドリング環境では、**プーラー経由の接続文字列**を使うと安定する。

### マイグレーション

- `migrations/` 配下に SQL ファイルを配置
- ツール: `golang-migrate/migrate` または `pressly/goose`
- マイグレーション実行は CI/CD 内で実行する(本番デプロイ前)
- ロールバック手順を migrations ファイルにコメントで明記

### バックアップ

- Neon は自動バックアップを提供(プランによる)
- イベント当日前日に手動でスナップショットを取得することを推奨
- イベント終了後、所定期間で削除(`overview.md` のデータ保持期間ポリシーに従う)

---

## 6. Web Push の構成

### VAPID 鍵の生成

```bash
# webpush-go の helper を使う
go run github.com/SherClockHolmes/webpush-go/cmd/generate
```

または Node.js の `web-push` ライブラリで生成可能:

```bash
npx web-push generate-vapid-keys
```

生成された鍵は環境変数に設定する。

### Service Worker(フロント)

```
public/sw.js                    -- Service Worker 本体
src/lib/push/                   -- Push 関連のクライアントロジック
  register.ts                   -- 通知許可と購読登録
  subscribe.ts                  -- Push サブスクリプションをサーバーに送信
```

### 送信ライブラリ(Go)

```go
// go.mod
// github.com/SherClockHolmes/webpush-go v1.x.x
```

### 配信フロー

```
1. 整理券取得 / pending 遷移 / called 遷移などのイベント発生
   ↓
2. notification_logs に "pending" 状態でレコード追加
   ↓
3. 別 goroutine で notification_logs を処理(キューワーカー)
   ↓
4. 来場者の push_subscriptions を取得
   ↓
5. webpush.SendNotification() で送信
   ↓
6. 結果を notification_logs に "sent" / "failed" で記録
```

詳細は `features/notification.md` を参照。

---

## 7. デプロイ手順

### 初回セットアップ

#### Neon

1. Neon でプロジェクト作成、PostgreSQL データベース作成
2. 接続文字列を取得して Cloud Run のシークレットに登録
3. マイグレーションを実行(`migrate -path ./migrations -database $DATABASE_URL up`)

#### Cloudflare R2

1. R2 バケット作成、アクセスキー発行
2. カスタムドメインまたは Public URL の設定
3. CORS 設定(必要に応じて)
4. 環境変数を Cloud Run に登録

#### Cloud Run(Backend)

1. Go アプリケーションを Dockerfile でコンテナ化
2. `gcloud run deploy` でデプロイ
3. 環境変数・シークレットを設定
4. カスタムドメイン(例: `api.event.example.com`)を割り当て

#### Cloud Run(Frontend)

1. Next.js を `output: 'standalone'` でビルド
2. Dockerfile でコンテナ化
3. `gcloud run deploy` でデプロイ
4. 環境変数を設定
5. カスタムドメイン(例: `event.example.com`)を割り当て

### 通常デプロイ

GitHub Actions 等の CI/CD で:

1. Pull Request マージ → main ブランチ更新
2. ビルド → コンテナイメージプッシュ
3. マイグレーション実行(必要時のみ)
4. Cloud Run のリビジョン更新
5. トラフィックを新リビジョンに切替

### ロールバック

- Cloud Run は過去のリビジョンが残っているので、UI またはコマンドで切替可能
- DB マイグレーションを伴うロールバックは慎重に(マイグレーションの down も用意しておく)

---

## 8. 監視・ログ

### ログ

- **アプリログ**: Go 側は `log/slog` で構造化ログ、本番は JSONHandler。Cloud Logging に集約される
- **アクセスログ**: Cloud Run が自動で記録
- **DB ログ**: Neon ダッシュボードで確認

### 監視

- **Cloud Monitoring**: Cloud Run の CPU・メモリ・リクエスト数・レイテンシ
- **Neon ダッシュボード**: DB 接続数、クエリ時間、ストレージ使用量
- **アラート**: 5xx エラー率が一定以上になったら通知(Slack または Email)

> **MVP では最低限の監視のみ**。本格的な APM(Sentry, Datadog 等)は v2 で検討。

---

## 9. イベント当日の障害対応

### よくある障害シナリオと対応

| 障害 | 対応 |
|---|---|
| Cloud Run のレスポンスが遅い | リビジョンの最大インスタンス数を増やす、コードに問題があればロールバック |
| Neon の接続上限到達 | プーラー経由か確認、必要なら一時的に上位プランへ |
| R2 が返らない | 画像が表示されないが致命傷ではない。一時的に CDN キャッシュで凌ぐ |
| Web Push が届かない | 画面 polling でフォールバックされるので、運営側で告知 |
| 全停止 | 紙の整理券に切替(運営マニュアル側で運用手順を整備) |

### 当日の事前確認

- 全環境変数が設定されているか
- マイグレーションが適用済みか
- ブースマスターデータが投入済みか
- VAPID 鍵が有効か
- 主要動線が E2E テストで通っているか
- 本番環境でテスト用の予約を取って動作確認

---

## 10. 開発環境

### ローカル起動

```
Backend:
  - Go 1.22+
  - PostgreSQL (docker-compose.yml で起動、または Neon 開発用ブランチを利用)
  - 環境変数を .env.local に記述
  - `go run cmd/server/main.go`

Frontend:
  - Node.js 20+
  - 環境変数を .env.local に記述
  - `npm install && npm run dev`

Connect-RPC:
  - `buf generate` で proto から型生成
  - 生成物は gen/ 配下に出力
```

### docker-compose.yml(ローカル DB 用)

```yaml
services:
  postgres:
    image: postgres:16
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: eventdb_dev
      POSTGRES_USER: dev
      POSTGRES_PASSWORD: dev
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata:
```

### マイグレーションの実行

```bash
# 適用
migrate -path ./migrations -database "postgres://dev:dev@localhost:5432/eventdb_dev?sslmode=disable" up

# ロールバック
migrate -path ./migrations -database "postgres://dev:dev@localhost:5432/eventdb_dev?sslmode=disable" down 1
```

### sqlc の実行

```bash
sqlc generate
```

---

## 11. 未決定事項

- カスタムドメインの取得・設定(運営側)
- イベント当日の SLA 目標(99.9%? 99%?)
- 災害対策(バックアップリージョン等、MVP では不要と判断)
- セキュリティ要件(WAF の導入有無、HTTPS 以外の設定等)
- データ保持期間(イベント終了後の削除タイミング)
- 監視アラートの宛先
