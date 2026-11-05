# Go単一配布・環境分離と安全なDB移行

- 計画ID: `11-safe-migration`
- 状態: 未着手（計画のみ）
- 更新日: 2026-11-04
- 区分: 基盤機能 / schema変更前に先行
- 旧計画: U14 / 全単位の横断移行
- レビュー対応: F23
- DB調査対応: DB01 / DB02 / DB05、DB03/DB04/DB06/DB07の移行確認
- 一覧・共通方針: [README.md](README.md)
- 根拠: [DB設計の調査結果](../../.claude/reviews/review%252Fcode-review/db-security-review.md)

## 実現すること

React/Viteの配布ファイルとConnect-RPC APIをGoの単一サービスで提供し、PostgreSQL/sqlcを維持する。DB更新と通常APIの権限を分け、接続先を検証しながら、既存HMDの有効券を保って一般受付へ段階移行できる。DB更新に失敗した状態では新しいアプリを稼働させない。

## 対象範囲と境界

UI/APIの統合buildと配信、local/Cloud dev/prdの環境境界、migrator/runtime/seedの実行経路と権限、TLS・接続/実行予算、migration失敗処理、追加schemaによる段階移行、復旧手順と専用試験環境を担当する。

schemaの具体的な所有は01〜10の各featureに置く。RLS・暗号化基盤・サービス分割を一律に導入しない。計画更新だけで実DBへ接続・変更しない。本番がsuperuserや証明書未検証であることは未確認のため、既存の確定状態として扱わない。

## 依存関係

- 11-A/B/Cはschema更新の基盤、11-Eは既存アプリでも作れる単一配布の基盤として、業務01〜10より前に完成できる。11-Eの静的配信設計/ローカルbuildはA〜Cと並行可能。
- 11-Fの環境リソース/手動で再現できる配布・復旧契約はA〜C/Eを前提に準備し、基本機能の実装と並行できる。実イベントの公開は別のリリース条件で判定する。
- 11-Dは機能ごとの移行/結合確認。一般受付分は01〜06、オプション分は対象機能の完成時に実施する。Dの全オプション完了を01や12の前提にしない。
- 12へ提供するのは再現可能なコマンド/成果物と環境・権限契約。11は12のworkflow実装に依存しない。

## 主な変更候補

リポジトリルートをbuild contextとする統合Dockerfile候補、.dockerignore、frontend/Dockerfileとnginx.confの段階廃止、frontend/vite.config.ts、frontend/src/lib/connect/client.ts、Goの静的配信/埋込みパッケージ候補、backend/entrypoint.sh、backend/Dockerfile、backend/cmd/server/main.go、backend/cmd/seed/main.go、DBロール/権限の運営設定、docker-compose.yml、追加migration、buf.gen.yaml、backend/sqlc.yaml、docs/spec/infrastructure.md、docs/operation/。新しいジョブや設定名は実デプロイ環境に合わせて決める。

## 単一サービスのbuild・配信

- **採用する構成**: React/Vite・Connect-RPC・PostgreSQL/sqlc/pgxを維持する。Node段階でVite build→生成静的ファイルをGo module内の生成用ディレクトリへcopy→Goのembed等で組込み→Goバイナリと必要なCA証明書を含むruntimeイメージを作る。埋込み先はGoのパッケージ境界に合わせて決定し、`../frontend/dist`を直接embedできる前提にしない。
- **配布の単位**: UIとAPIを同じイメージ・同じCloud Runサービス・同じ公開originで提供する。「1つ」は環境ごとのWeb配布先を意味し、dev/prdを同じサービス/DBに混ぜる意味ではない。DBとmigrationの管理実行は別の責務を維持する。
- **配信handler**: 既存Connect-RPCのパスを維持し、API/healthをSPA fallbackより先に解決する。APIの不明パス/エラーへindex.htmlを返さない。静的ファイル不存在は404、画面の直接URL/リロードはSPAへ戻す。パストラバーサルや秘密ファイル配信を防ぐ。
- **cache**: hash付きassetは長期cache、indexと更新確認用ファイルは適切な再検証、個別券/APIは機密応答のcache制御を分ける。旧Service Workerのscope/cacheと古いfrontend originの切替を確認し、無条件に過去ユーザーのデータを消さない。
- **実行時**: 公開先にはnginx/Nodeを必須にしない。frontend専用Cloud Runは統合動作・URL/QR/cookie移行を確認してから停止する。migrator用秘密値をGo runtimeへ追加して配布統合を実現しない。
- **build inputs**: npm ciとgo.mod/go.sumを基準にツール版と入力を固定し、生成物/依存物の追跡方針を整理する。現在trackedのnode_modules/distやbackend/seedを計画更新だけで削除しない。実装時に追跡解除・再生成・履歴維持を別変更で扱う。root build contextから.env/実データ/個人メモ/.git/node_modulesを除外する。
- **検証順序**: embedが生成静的ファイルを必要とする構成では、Vite build/copy→Goのbuild/test→統合イメージsmoke/E2Eの順を再現可能な手順にする。Vite build成功を型検査/lint成功とみなさず、必要な型検査の実行方法を明示する。

## dev/prdの分離とリリース

現在のbuild/環境調査は [調査レポート](../../.claude/reviews/review%252Fcode-review/build-release-investigation.md) を参照。以下はこれから実装する方針で、現在の環境が分離済みという意味ではない。

| 環境 | UI/API | DB・秘密値 | 用途 |
|---|---|---|---|
| local | Vite開発サーバー＋Go。Vite proxyでConnectの同一origin動作を再現 | ローカル専用PostgreSQL/テスト秘密値 | 画面の即時更新と開発 |
| Cloud dev | Go統合イメージの専用サービス | prdと別DB/role/secret、テストデータ | リリース候補の実機/QR/Cookie/統合検証 |
| prd | devで検証した同じイメージdigestを専用サービスへ昇格 | prd専用DB/role/secret | イベント運営 |

- dev/prdに同じ最適化済みVite成果物とGo実行物を使い、接続DB・secret等はruntime設定で分離する。APIは同一originを基本にして環境URLのbuild時埋込みをなくす。ブラウザに必要なruntime設定を追加する場合は公開可能な値だけに限定する。Pushは延期し、鍵は必須化しない。
- Viteのproduction buildと、Cloud上のdev/prdというリリース環境名を区別する。コードは `APP_ENV == "production"` で動作を分けるため、単に `prd` を渡して本番モードと思い込まない。本番相当挙動のCloud devと環境識別の設定方法を明示し、devに本番DBを渡さない。
- 同じcommitの成果物を一度作り、SHAタグ/digestで記録してdev→prdへ昇格する。latestの名称だけで検証済み成果物を判断しない。migrationも対象DB/roleを環境ごとに指定し、適用確認→新revision検証→トラフィック切替を記録する。
- GitHub Actionsのworkflow・PR必須チェック・mainからのdev自動配布・prdの承認ゲート/同一digest昇格は [12-github-actions.md](12-github-actions.md) が担当する。11は再現可能なbuild/test・環境リソース・権限分離・migration/復旧手順を提供する。12の完成を11や01の着手前提にせず、循環依存を作らない。
- Cloudサービス/registry/DBとその権限契約は11-F、GitHub Environment・OIDCのrepo/main/environment信頼条件・workflow実行権限と配布履歴は12で設計する。11で定義するmigrator/runtimeのDB権限とdev/prdの分離は、その自動化でも維持する。
- local/Cloud dev/prdの許可origin、公開API/asset path、Cookie、DB更新role、バックアップ/削除設定を一覧化し、既存のCORS環境変数名の食い違いとNext.js向けの古い手順も修正する。

## 単一配布の実装手順

1. 統合buildの入力・embed配置・ルーティングを設計し、Goの静的配信handlerを追加する。Connect-RPC/proto・PostgreSQL/sqlcは継続する。
2. root contextのmulti-stage buildとignore、型検査/生成/テスト手順を整え、npm build→Go build→単一runtimeの再現性を確認する。
3. クライアントを同一origin APIへ、local Viteをproxyへ切り替える。既存の別API URLのbuild引数を既定で不要にする。
4. Push UI/API/enqueue/worker/不要なSW登録を初期リリースで無効にし、VAPIDなしの起動と画面ポーリング受付を確認する。
5. 11-Fで新Cloud devと独立DB/secretの配布契約を検証する。実際のprd昇格は一般受付リリース条件と12-Cの承認後に行う。旧URL/QR/Cookie/稼働券/旧Push利用の切替条件が整う前に、既存サービスのtrafficを移さない。
6. 統合後の直接URL・asset cache・session・RPC・発券/入場を確認し、旧frontendサービスの停止と旧build手順の撤去を別の小変更として行う。

## 実装手順

1. **現状を資格情報なしで確認する。** 実roleのowner/superuser/CREATEROLE/BYPASSRLS、schema/table/sequenceのGRANT、PUBLIC/default privileges、migration実行場所、接続先/TLS、DB側timeoutをメタデータで把握する。URL・password・実PIIを調査ログへ出さない。開発・試験・本番は別DB/資格情報とする。
2. **更新失敗時の起動を停止する。** 全migration失敗をechoで成功化する処理を除去する。変更なし/dirty/接続不可/SQL失敗を区別し、新schema適用確認後だけ新アプリを稼働させる。Neon direct接続や別migration jobを含め実行方式を決める。
3. **DB接続権限を分離する。** schemaを所有/変更するowner・migratorと、API実行用runtimeを別ロール/秘密値にする。通常プロセスがDDL用資格情報を保持しない実行経路へ移す。seedは管理者作成が必要な一時経路として切り離す。最低限はmigrator/runtimeの分離とし、用途ごとのroleの増加は必要性を見て決める。
4. **runtimeの許可表を作る。** 各featureに必要な表/列のSELECT/INSERT/UPDATE/DELETEとsequence使用だけを許可し、CREATE/ALTER/DROP・role作成・不要schema操作を許さない。所有権/role継承/将来テーブルのdefault privilegesも検証する。名前だけ違う同権限roleにしない。期限削除や通常運営のDELETEは必要範囲を明示する。
5. **接続先を検証する。** 本番migrator/runtimeの両方で証明書チェーンとhostを検証するTLS設定（利用ドライバーでverify-full相当）を基準とする。requireだけをhost検証済みとみなさない。秘密値保管・更新とnetworkアクセス範囲を明記する。ローカルsmoke-testの平文接続は隔離した開発環境に限定し、公開portのlocalhost bind等を確認する。
6. **処理量と待ち時間を予算化する。** request/workerごとのcontext期限、statement/lock/idle-in-transactionの上限、pool取得待ちを検討する。1instanceのpool上限×最大instance数＋migration/管理処理の接続数をDB予算内にする。移行/削除/exportは通常受付と用途別の予算とし、一律の短いtimeoutで移行を失敗させない。既存pgx poolが無制限とは仮定しない。
7. **制約追加前のデータを確認する。** 重複番号/入場/管理者name、券とgroup/session/visitor/boothの不一致件数を専用DBまたは承認された読み取りで調べる。各featureで是正方針を作り、過去migrationを編集せず追加migrationで制約を導入する。実データの再採番/削除を自動是正の既定にしない。
8. **段階移行を管理する。** 追加schema→既存HMDの対応付け→受付パス/API追加→フロント切替→旧依存撤去の順に進める。nickname/pin_hash/participants.age必須の解消は02/03/07、関係制約は03/04/08、保存/削除は06、通知schemaは09で所有する。buf/sqlcで生成し、生成物を手書きしない。
9. **切替と復旧を検証する。** 新旧共存・旧APIの操作権限・HMD有効券・秘密値更新・接続pool再生成を試験する。互換維持できない箇所は告知した停止時間で移す。復旧は追加schemaを保持したアプリ切替を優先し、未保護ID操作の復活・開催中reset・破壊的downを避ける。削除済みデータが戻るバックアップ復元時は06の再削除/失効手順を実施する。

## 完了条件・検証
- [ ] migration失敗/dirty/接続不可で新アプリを稼働させず、成功/変更なしなら起動する。
- [ ] 11-B/Cで基盤の許可表とDDL拒否を確認し、各featureのPRで必要DML/sequence権限を追加・試験する。一般受付の全操作は11-D一般受付分で結合確認し、通知の許可は09有効化時だけ検証する。
- [ ] runtime環境にmigrator用秘密値が不要で、seedが別の限定実行経路になっている。新規/既存テーブル・sequenceの権限に漏れがない。
- [ ] 正しい証明書/hostでは接続でき、不正CA・host不一致・本番の平文接続は拒否する。migrator/runtime双方で確認する。
- [ ] query/lock/pool取得待ちが予算で終了し接続が回収される。最大instance数を含む接続予算と用途別timeoutが記録される。
- [ ] 既存の重複/帰属不一致件数と是正方針が確認され、追加制約で正常なデータ/処理を壊さない。
- [ ] 11-D一般受付分で旧IDだけのclaim・条件解除・未保護旧APIへの迂回を拒否する。新HMD機能との結合は07の有効化時に追加し、旧有効券/必要schemaをそれまで保持する。
- [ ] 新仕様の移行/秘密値更新/復旧手順を専用DBで確認し、稼働中の券を削除/再採番しない。
- [ ] Go統合イメージだけで画面とConnect-RPCを提供し、runtimeにnginx/Nodeを必要としない。
- [ ] 画面の直接URL/リロード/asset取得が成功し、API/healthエラーをSPAへ誤fallbackしない。
- [ ] local proxyとCloud dev/prdでパスCookieが正しく動き、環境固有のAPI URLをbuildへ埋め込まず同じdigestを昇格できる。
- [ ] Cloud dev/prdのDB/role/secretが分かれ、devの試験/削除/移行がprdへ到達しない。
- [ ] VAPID鍵/Push worker/Service Worker登録なしで起動し、発券→画面確認→呼出し→入場が通る。
- [ ] 旧URL/QR/Cookie/SWと稼働券の切替・復旧を検証し、旧frontendの停止順と残る旧Push利用の扱いを記録する。

## 移行・分割方針

| 段階 | 所有する成果物 | 実施前提・完成時点 |
|---|---|---|
| 11-A | migration失敗停止 | 最初に実装。新schema公開前 |
| 11-B | runtime/migrator/seed権限分離と追加tableへの適用規約 | Aの失敗処理。基盤roleを作り、各featureで権限表を更新 |
| 11-C | TLS/接続数/用途別実行予算 | Bの接続経路。01のschema変更前に基盤を検証 |
| 11-E | 単一Go build/静的配信・local proxy・初期Push停止 | 業務featureと独立して作成。12-A1/01の前提 |
| 11-F | Cloud dev/prdの専用資源と手動でも再現できる配布・復旧契約 | A/B/C/E。01〜06と並行可。12-Bの前提 |
| 11-D | 各featureの移行/結合記録 | 一般受付分は01〜06完成時、任意機能分は各有効化時に追記 |

12のworkflow・承認は本計画へ含めない。A/B/C/Eの基盤完成とDの最終結合を同じ完了待ちにしない。既存roleの権限撤去は新runtimeで必要処理を検証後に行う。旧HMD/対戦/Pushに関するschema撤去・旧URL停止は、該当イベントの終了または各オプションの移行確認まで行わない。一般受付は独立devで先に検証できる。

## 実行方法の引継ぎ

04の不在判定と06の期限削除が必要とする起動契機・CPU・権限・上限は11-Fで環境へ対応付ける。Push停止がこれらの停止を意味しない。実装内容は04/06、配布への自動組込みは12が担当し、必要な処理が無アクセス時にも動くか専用環境で確認する。11-Fの初期完成は04/06の処理本体を待たず、各featureの実装PRで実行先/権限の追加と結合確認を行う。

## 実装前に具体化する事項

実デプロイのmigration job/direct接続、現在のrole/grants/TLS設定、secret管理と更新手順、用途別timeout・最大接続数、開催中の有効券、切替時間を確認する。本番で確認できていない設定を推測で不備または安全と断定しない。

未実施の検証を完了扱いにしない。計画更新時点でDB・実装・環境設定は変更しない。
