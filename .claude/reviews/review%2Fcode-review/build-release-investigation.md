# build・dev/prd・GitHub Actionsの現状調査

- 調査日: 2026-11-03（Asia/Tokyo）
- 対象repo: `saitoomoo/reception-system`。ローカル `review/code-review`、HEAD `9d2a40c2c3a602372b09945ca43bb97e6442d781`。
- 対象: tracked設定/全ローカル履歴、公開GitHubの現在のbranch/workflow実行/関連検索、開発メモ中の配布コマンド、メモ指定project/regionのCloud Runメタデータ。
- 実装・workflow・Cloud設定・DB・デプロイは変更していない。既存計画の更新と本レポート保存のみ。
- 実.env/DB URL/secret値は読まず、本番DBには接続していない。Cloudの確認対象は `reception-system-496200` / `asia-northeast1` に限定。

## 結論

現在はReact/ViteとGoを別イメージ・別Cloud Runサービスで配布する構成。ローカル開発とDocker smoke-testはあるが、repo内にCloud dev/prdの明確な環境別リリース設定やGitHub Actions workflowはない。

GitHub Actionsを導入しないと決めた理由は、調べた文書・履歴・関連検索には見つからなかった。むしろ仕様書は「GitHub Actions等のCI/CD」を想定している。したがって「意図的に不採用」ではなく「仕様上の想定が実装されていない」と説明するのが正確。個人開発/MVPを優先して手動運用になった可能性はあるが、動機の裏付けはない。

## 現在のbuild

| 対象 | 確認した設定 | 配布結果 |
|---|---|---|
| フロント | [frontend/Dockerfile](../../../frontend/Dockerfile): Node 20-alpineでnpm ci→Vite build | nginx 1.27-alpineがdistを配信 |
| API | [backend/Dockerfile](../../../backend/Dockerfile): Go 1.25-alpine、linux/amd64、CGO無効 | Alpine runtimeでserver/migrate/seedを含む |
| 起動 | [entrypoint.sh](../../../backend/entrypoint.sh): migration後server | 現状は全migration失敗を無視して続行（既知F23） |
| proto | [buf.gen.yaml](../../../buf.gen.yaml) | Go/TSの型と通信コードを生成 |
| SQL | [backend/sqlc.yaml](../../../backend/sqlc.yaml) | SQLからGoコードを生成 |
| 検証 | [package.json](../../../package.json)、[playwright.config.ts](../../../playwright.config.ts) | rootに通知系E2E、backendにGoテスト。frontendのscriptsはdev/buildのみ |

フロントのVITE_API_URL/VITE_VAPID_PUBLIC_KEYはbuild時に埋め込まれる。起動後の環境変数変更だけでは既に作ったJSの接続先は変わらない。これはViteの [env/mode仕様](https://vite.dev/guide/env-and-mode) に沿う挙動。現在の [Connectクライアント](../../../frontend/src/lib/connect/client.ts) はAPI URL未指定時にlocalhost:8080へ接続するため、配布の設定漏れが来場者端末側のlocalhost接続になる。

frontendのDocker ignoreはdist/node_modules/envを除外し、npm ciで再生成する。一方Gitにはnode_modules 64,671ファイル、dist 4ファイルが追跡されていた。ignoreに書くだけでは追跡済みファイルは外れない。今後の統合buildではlockfileからの再生成と追跡方針を整理するが、今回それらを削除/追跡解除していない。

## dev/prdの棲み分け

| 環境 | コード・記録で確認できたこと | 未確認/注意点 |
|---|---|---|
| local開発 | Viteのnpm run dev（5173）＋go run（8080）。DB接続は環境設定 | 実.envの接続先は読んでいないため、本番DBとの独立は未確認 |
| Docker smoke-test | [docker-compose.yml](../../../docker-compose.yml)はlocal image確認用途と明記。nginx/Go/PostgreSQL、DB host port5433、APP_ENV=development | Cloud上のdev環境とは別。配布Dockerを使っても本番modeではない |
| メモ指定Cloud Run | reception-backendとreception-frontendの2サービス。現状はUI/API別配布 | 同project/regionでdev/prd別のサービスは見当たらない。他project/regionの存在は未調査 |
| Cloud dev | repo設定・確認対象Cloud Run一覧・GitHub branchに独立した環境を特定できず | dev DB/secret/role、環境別deploy手順、昇格ルールは未確認 |
| prd相当の配布記録 | 開発メモに本番Neon接続の登録手順、backend:latestのdocker build/push、gcloud run deployの記録 | 現在稼働するサービスのAPP_ENV値・DB接続先・実secret値は未確認 |

Cloud Runの読み取り結果（設定変更なし）:

| サービス | 最新ready revision | トラフィック |
|---|---|---|
| reception-backend | reception-backend-00010-gzt | latest revisionへ100% |
| reception-frontend | reception-frontend-00008-tz8 | latest revisionへ100% |

実イメージdigestやruntime環境値の検証までは行っていない。サービス名だけでdev/prdの境界や安全性を保証しない。

### 環境設定の食い違い

- backendは `APP_ENV == "production"` で.env読み込み・JSONログ・本番reset拒否を分ける（[main.go](../../../backend/cmd/server/main.go)、[admin handler](../../../backend/internal/feature/admin/handler.go)）。`APP_ENV=prd`を同じ意味で扱うコードではない。
- CORSは現コードが `ALLOWED_ORIGINS` を読むが、composeは `CORS_ALLOWED_ORIGINS` を設定する。ローカル既定許可originがあるため動いていても、環境移行時の設定漏れになり得る。
- [インフラ仕様](../../../docs/spec/infrastructure.md)はフロントをNext.js/NEXT_PUBLIC_*、standalone配布として説明するが、実コードはVite/VITE_*。READMEの環境サンプルコピー手順に対応するtracked `.env.example` も見当たらない。
- PlaywrightはViteだけを自動起動し、バックエンド/使い捨てDB/環境の準備はworkflow化されていない。現在の3本は通知系中心で、一般受付の主要フローへそのまま十分とはしない。

## GitHub Actionsの確認事実

GitHub連携を使い、2026-11-03時点で次を確認した。

- [リモートbranch一覧](https://api.github.com/repos/saitoomoo/reception-system/branches?per_page=100): mainのみ。SHAはローカルHEADと一致。review/code-reviewはローカルのみ。
- [Actions run一覧](https://api.github.com/repos/saitoomoo/reception-system/actions/runs?per_page=10): total_count=0。
- default branchの `.github` contentsは404、ローカルHEADにも `.github/` はない。
- shallowではないローカル全14commit/全refで `.github` の追加/削除履歴は見つからず、Actions/workflow/CI/CDのcommit説明も見当たらない。
- 関連issue/commit検索でも導入を見送る理由を見つけられなかった。検索で見つからないことは、口頭・別資料で検討がなかった証明ではない。

現在runが0件であることは保存期限・削除済み実行の可能性を排除せず、「過去に一度も実行されていない」証明には使わない。GitHub側のActions許可設定・Environment・全組織設定や、別repoからの自動処理までは調べていない。

### 履歴から分かること

- 2026-05-10 `b0484f51`「add doc spec」: インフラ仕様にCI/CD想定が追加された。その後このファイルの更新履歴は確認できない。
- 2026-05-14 `34640af9`「adjst deploy」: frontend/backend Dockerfile、nginx、entrypoint、compose、seed等を追加。workflowは含まれない。
- 開発メモにはDocker build/pushとgcloud deploy、デプロイ成功出力がある。手動の配布経路が少なくとも記録されている。

[インフラ仕様の通常デプロイ節](../../../docs/spec/infrastructure.md)はmain更新→CI build→image push→migration→Cloud Run revision更新という想定。実際のworkflowがないため、文書を現在の自動化の証拠にはできない。

## Cloud Buildの確認限界

同projectのglobal/asia-northeast1についてtrigger一覧の読み取りを試したが、どちらもCloud Build APIが未使用または無効というSERVICE_DISABLEDの応答だった。APIを有効化せず停止した。triggerなしという正常な空一覧は取得していない。

この結果から、当該projectに現在利用可能なCloud Build自動配布があるとは確認できない。他projectのbuild、他のCI、ローカルからの配布を否定する証拠でもない。

## 今回採用した将来のbuild・環境方針

- React/Vite buildをGoへ組み込み、各環境のUI/APIを1つのイメージ・サービス・公開originで配布する。
- PostgreSQL/sqlc/pgxとConnect-RPC/protoは維持。API接続先は同一originを使い、環境固有URLをJSへ埋め込まない。
- localはVite＋Goを残してproxyで開発する。Cloud dev/prdは別サービス・DB/role/secretで、同じ最適化済みイメージを使う。
- commit SHA/digestで成果物を識別し、Cloud devで検証したものをprdへ昇格する。Cloud Runはtagをdigestへ解決してrevisionに固定するので、tag名と実digestを区別して記録する。[Cloud Runの配布仕様](https://docs.cloud.google.com/run/docs/deploying)
- Pushは後続へ延期し、初期は画面の定期更新で受付を完結する。初期の鍵/worker/購読/SW登録を必須化しない。
- GitHub ActionsはまずPRのbuild/test、次にCloud dev、最後に明示的な承認/手動トリガーによるprd配布という導入案を11に記載。workflowの導入そのものは今回実施しない。GitHub Environmentsでは承認・配布先secret等の境界を設定できる。[GitHub公式資料](https://docs.github.com/en/actions/concepts/workflows-and-actions/deployment-environments)

## 今回変更したもの・実施していないもの

`.codex/plan/` の既存11計画と一覧へ、単一Go配信・同一origin・Push延期・dev/prd分離と昇格の計画を反映した。コード/Dockerfile/compose/workflow/Cloud設定は変更せず、build・test・deploy・migration・API有効化も実行していない。
