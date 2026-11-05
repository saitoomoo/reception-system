# code-review 適用ガイド（試験運用）

共通の個人スキル `code-review` を reception-system で使用するための参照索引。検出・並列実行・重複排除・レポート形式は共通スキルに任せ、規約本文はこのファイルに複製しない。

## 使い方

このリポジトリを対象に `$code-review`（ローカル）、`$code-review <PR番号>`（保存＋PRコメント投稿）と依頼する。`/code-review` と書かれた依頼も同じ意図として扱う。

- ローカル保存先: `.claude/reviews/<エンコードしたブランチ名>/code-review.md`
- PR保存先: `.claude/reviews/pr-<番号>/code-review.md`
- 試験時に外部投稿を避ける場合は「PR #123をレビュー、ローカル保存のみ」と指定する。
- レビューだけでは修正・commit・push・mergeを行わない。

## 最初に読む正典

全担当は [CLAUDE.md](../../CLAUDE.md)、[共通規約](shared.md)、[チェックリスト](checklist.md) の対象セクションを読む。業務に関わる変更では [ドメイン規則](../spec/domain.md) の該当するR番号を保持して引用する。認証・整理券・状態遷移・マッチング・特殊フローを重点対象とするが、無関係な仕様を全件読み込む必要はない。

MVP・少人数開発という前提を維持する。大規模な抽象化や将来向け最適化を必須にせず、今回の差分による具体的な実害を優先する。TDDや事前合意の実施有無は最終diffだけから断定しない。

## 現物で再確認する差異

2026-11-03の導入調査では以下を確認した。これは恒久的な規約の上書きではなく、レビュー時の確認ポイントである。

- `CLAUDE.md` / frontend規約はNext.js App Router想定だが、現状は `frontend/package.json`・`frontend/vite.config.ts`・`frontend/src/router.tsx` によるVite＋React RouterのSPA。Next.jsのServer/Client Componentや `app/<route>` 配置を、そのまま既存SPAへの必須条件にしない。新しい変更が移行を意図する場合はその範囲を確認する。
- Goのバージョンは `backend/go.mod` を参照する（導入時は1.25.0）。生成物の実際の配置は `buf.gen.yaml` と `backend/sqlc.yaml` で確認する。導入時はprotobufが `backend/gen/go/`・`frontend/src/gen/ts/`、sqlcが `backend/internal/db/`。ルート `gen/` だけを見て再生成漏れと判定しない。
- PIIの取得禁止という総論と、保護者同意で氏名・IP等を保存する詳細仕様（domainのR-005-2）には不整合がある。対象変更に関係する場合は両方の出典を示し、確認事項にする。どちらかを推測で正典に決めて修正を要求しない。ログへのPII・認証情報の露出は別途確認する。
- `CLAUDE.md` が参照する `~/.claude/CLAUDE.md` は導入時には存在しなかった。存在確認し、欠落した共通規約を作り上げない。

これらを差分と無関係な既存不備として毎回指摘しない。今回の変更で悪化・到達可能になった場合は因果関係を示す。

## 3担当の参照先と重点項目

### 規約・正しさ担当

- フロント変更: [frontend.md](frontend.md)、`frontend/src/screens/`、`frontend/src/hooks/`、`frontend/src/router.tsx` と関連呼び出し元。状態管理・エラー表示・再取得・画面遷移とAPI契約の整合性を確認する。
- Go変更: [backend.md](backend.md)、`backend/internal/feature/<機能>/` と関連テスト。基本2層、必要時にserviceを置く設計を尊重し、全機能への3層化を強制しない。
- API変更: `proto/` が契約の正典。`buf.gen.yaml` による生成物と呼び出し元を照合する。
- DB変更: `backend/migrations/` がスキーマの正典。`backend/queries/`・`backend/sqlc.yaml`・[data-model.md](../spec/data-model.md) を照合する。
- 機能仕様は [auth](../spec/features/auth.md)、[ticket](../spec/features/ticket.md)、[match](../spec/features/match.md)、[admin](../spec/features/admin.md)、[notification](../spec/features/notification.md)、[cheer](../spec/features/cheer.md) から必要なものだけ読む。
- 年齢と同意、同一ブースでの重複取得、クールダウン、状態遷移、体験タイプ別の処理、同時発行・同時入場の整合性を差分に応じて確認する。

### セキュリティ担当

- スタッフ・全体管理者の認証は `backend/internal/pkg/auth/session.go` と各handler、ルート登録は `backend/cmd/server/main.go`。導入時は署名Cookie方式であり、JWTや共通認可interceptorの存在を前提にしない。
- スタッフのセッション由来のBoothIDと操作対象ブース、全体管理者のrole判定を追う。`booth_id` はアクセス境界の候補であり、全クエリに機械的な条件追加を求めない。全体管理者の横断操作と来場者自身の権限も区別する。
- 来場者認証は [auth仕様](../spec/features/auth.md)、`frontend/src/hooks/use-auth.ts`、`frontend/src/lib/pin-hash.ts`、visitor/ticket等のhandlerを確認する。クライアントの表示制限をサーバー認可とみなさない。
- Cookie属性・CORS・認証付きリクエストは、サーバー設定と `frontend/src/lib/connect/client.ts` を併せて追う。
- PIN・パスワード・セッション・VAPID秘密鍵・Push endpointの漏洩、他来場者の整理券操作、他ブースの呼び出し・入場処理を確認する。実際の `.env`、CSV、ログを無差別に収集しない。秘密値をレポートに再掲しない。
- 年齢・同意はプロジェクトの業務仕様として確認し、法令やHMDメーカーの最新要件への準拠をこのレビューだけで保証しない。

### パフォーマンス担当

- Prisma用パターンを持ち込まない。`backend/queries/`、`backend/internal/db/` の生成SQL呼び出し元、pgxの接続・トランザクションを追う。修正案は手書きSQLと呼び出し元を対象にする。
- 一覧・待機列・管理画面のN+1、件数上限、インデックスと条件、同時受付時のロック・競合、長いトランザクションを確認する。
- `backend/internal/feature/ticket/pending_worker.go`、notification worker、マッチングの処理量・重複実行・キャンセルを変更範囲に応じて確認する。
- Web Pushとポーリングの併用は仕様。`frontend/public/sw.js`、`frontend/src/lib/push/`、Query設定で過剰再取得・タイマー解除漏れ・再試行増幅を確認する。ポーリングの存在だけを問題にしない。
- 来場者1,000人以上という想定から負荷を検討するが、未計測の応答時間や改善率は記載しない。

## 検証コマンドの扱い

レビューは意味上の検査であり、全ビルド・テストの実行は前提にしない。必要な検証だけ実行し、未実施を明記する。以下は導入時に実在を確認した候補で、成功済みという意味ではない。設定変更時には再確認する。

| 対象 | 実行場所 | 候補 | 条件・限界 |
|---|---|---|---|
| Go通常テスト | `backend/` | `go test ./...` | integrationタグ付きのDBテストを含まない |
| Go DB統合テスト | `backend/` | `go test -tags=integration ./...` | testcontainersによるDocker/PostgreSQL起動を伴う。既存サービスや運用DBを流用しない |
| フロントbuild | `frontend/` | `npm run build` | Vite build。型検査・lintの成功を意味しない。追跡済みdistが変わり得るため検証は隔離先で行う |
| 通知E2E | ルート | `npm run test:e2e` | Playwright設定・テスト・ヘルパーで接続先を確認。バックエンドと専用の使い捨てDBが必要。共有DBや本番への試行をしない |

導入時のfrontend scriptsはdev/buildのみ。存在しないlint/test/typecheckスクリプトを実行済みにしない。型検査が必要ならローカルのツール有無と設定を調べる。新しい依存導入や生成処理をレビューのために自動実行しない。

## 対象外と生成物

`node_modules/`、`frontend/dist/`、Playwrightの録画・snapshot・CSV等の `.playwright-mcp/`、`playwright-report/`、`test-results/` は通常の意味レビューから除き、除外を記録する。配布物だけの変更・配布設定の変更なら対応ソースとの整合性を確認し、無条件に無視しない。

protobuf/sqlc生成物は編集対象にせず、契約・SQL変更との整合確認に使う。既存の未コミット差分や生成物を消したり復元したりしない。
