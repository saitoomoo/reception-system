# GitHub Actionsによる検証・dev配布・承認付きprd昇格

- 計画ID: `12-github-actions`
- 状態: 未着手（計画のみ）
- 更新日: 2026-11-04
- 区分: リリース機能 / PR検証と環境別の自動配布
- 根拠: ユーザー指定のPR build/test→main更新でdev→承認後に同じイメージをprdへ昇格
- 一覧・共通方針: [README.md](README.md)
- 現状の調査: [build/リリース調査](../../.claude/reviews/review%252Fcode-review/build-release-investigation.md)

## 実現すること

PRで変更を検証し、mainへ入ったコードをdevへ自動配布する。devで検証済みのリリース候補を固定し、人が承認した候補と同じイメージdigestをprdへ配布する。承認の後に再buildしない。

## 対象範囲と境界

GitHub Actions workflow、PRの必須チェック、mainのbuild/publish/dev deploy、dev/prd Environment、承認、Google Cloudへの期限付き認証、migration/deployの実行順、成果物の識別と配布履歴を担当する。

[11-safe-migration.md](11-safe-migration.md) がDockerfile・Go静的配信・DBロール/TLS・環境リソース・migration手順を定義し、本計画はそれらを自動実行する。PostgreSQL/sqlc/Connect-RPCと環境ごとのGo単一サービスを維持し、Push延期も維持する。今回workflow作成やGitHub/Cloud設定変更は行わない。

## 依存関係

- 12-A1（初期PR CI）: [11](11-safe-migration.md) の11-Eと、検証コマンド/使い捨てDBの契約。既存build/testを自動化し、基本機能実装と並行する。11-Dや01〜10全体の完成を待たない。
- 12-B（main→dev自動配布）: 12-A1と11-A/B/C/E/F。初期はテスト専用devで現在の候補のhealth/smokeを実行し、未完成の受付を一般公開しない。
- 12-A2（一般受付の必須検証完成）: 01〜06の完成と11-D一般受付分。各機能のPRで検証を順次追加し、最後に一般受付全体のrequired checksを確定する。
- 12-C（承認付きprd昇格）の設定/失敗試験はBと並行準備できる。本番運用開始は12-A2/B、11-D一般受付分とREADMEの一般受付リリース条件を満たした候補が前提。
- 任意機能07〜10や後回しのPushを、A1/Bの導入や基本prd配布の必須条件にしない。

## パイプラインの契約

| 契機 | 検証・処理 | 成果物・配布 | 権限 |
|---|---|---|---|
| pull_request | frontend build/必要な型検査、Go通常/DB統合テスト、統合build/smoke。12-A2で一般受付E2Eを必須化 | 検証結果のみ。環境へ配布しない | 原則read-only、使い捨てDB。Cloud/prd権限不要 |
| mainへのpush | merge後SHAを検証し、統合イメージを一度build/publish | commit SHAとdigestを固定し、devへ自動配布・検証 | main専用のpublish/dev deploy権限 |
| dev検証成功後のprd候補 | 候補SHA/digest・dev結果・schema互換性を提示し承認待ち | 承認後に同じdigestをprdへ配布。再buildなし | prd Environment承認後だけ認証/配布権限 |

PRで作ったイメージとmainのmerge後SHAのイメージは別物として扱う。「同じイメージ」の昇格はmainから作成してdevで確認した成果物に限る。PRの未信頼artifactをprd候補へ取り込まない。

## 実装手順

1. **検証コマンドを固定する。** lockfile/Go moduleと11の再現可能なbuildを使う。Viteの生成物をGoへ埋め込む構成では生成/copy→Go build/testの順序を守る。Vite buildだけを型検査とみなさず、実在する型検査/生成整合チェックを定義する。12-A1は既存の実行可能な通常/DB統合テストと11-Eのbuild/smokeを対象にし、未実装の一般受付E2Eを存在すると扱わない。01〜06で追加する検証は各PRからCIへ登録し、12-A2で取得→呼出し→入場→失効/削除と直接URL/API fallbackの一般受付E2Eを必須にする。通知系E2EはPushの後続導入時へ分ける。
2. **PR CIを追加する。** pull_requestで必要チェックを実行し、必須チェック名とmainの保護を定義する。外部PRはCloud資格情報/prd secretにアクセスできない。pull_request_target等の強権限でPRコードを実行しない。失敗をcontinue-on-errorや空の成功jobで通さず、未実行と成功を区別する。既存baseline失敗を発見したら根拠を整理し、検証を黙って外さない。
3. **環境と認証を準備する。** dev/prdのGitHub Environmentと専用Cloud配布先/DB/role/secretの対応を明記する。OIDC/Workload Identity Federationを第一候補にし、repo/mainまたはEnvironment等の信頼条件を絞る。publish/dev/prdの許可を分け、prd認証は承認ゲートの後でのみ取得する。migratorとruntimeのDB権限は引き続き分離する。Action参照は固定版/SHAを管理する。
4. **main buildと成果物記録を追加する。** main更新時にmerge後の正確なSHAを検証し、Go統合イメージを一度だけbuildしてregistryへpublishする。SHAタグだけでなくdigestを取得し、repo・commit SHA・workflow run ID・イメージdigest・migration/schema版をリリース記録に結び付ける。latestを承認対象にしない。
5. **dev自動配布を追加する。** mainの検証/publish成功後に、dev用migratorで必要なschema更新→同じdigestをdevへdeploy→その候補で実装済みのhealth/主要フローsmokeを行う。12-A2前のdevはテスト専用の候補環境で、一般来場者へ公開しない。一般受付完成後は全必須smokeを外さず実行する。失敗時はprdへ進まず、migration失敗時に新revisionへtrafficを移さない。通常の業務テストは専用データで行い、prdへ接続しない。
6. **候補を固定してprd承認を待つ。** dev検証成功に加え、READMEの一般受付リリース条件を満たす記録を確認してからSHA/digest・dev結果・migration変更・切替/復旧方法を提示する。未完成の基本機能を承認だけで公開可能としない。prd EnvironmentのRequired reviewers等で承認を要求する。workflow_dispatchだけを承認ゲートの代用にせず、承認なしにprd jobが実行できないようにする。単独運営時の承認者/自己承認可否は実際の人数とGitHubプランで定め、ゲートを迂回する実装にしない。
7. **prdへ同じdigestを昇格する。** 承認後に固定候補がmain由来で、dev検証成功済みかを確認する。devの現在のlatestイメージや任意入力のdigestへ差し替えず、必要なprd migrationと互換性を確認して固定digestをdeployする。承認待ちにmain/devが進んでも候補のSHA/digestを変更しない。候補が失効/未検証/現在schemaと非互換なら再検証と再承認を求める。
8. **競合・再実行・復旧を整える。** PR CIは同じPRの古い実行を取消可能とする。dev/prdは環境別に配布を直列化し、migrationやtraffic切替の途中を新pushで強制取消しない。mainの到着順が逆転した古いrunが新しいdevを巻き戻さない確認を入れる。prd再実行も承認済み固定候補と既存revision/DB状態を照合する。復旧は11の互換性条件を守り、過去の検証済みdigestを選んで承認付きで戻す。
9. **段階的に有効化する。** 12-A1で既存コマンドのPR検証→12-Bでmain build/publish/devを早期に導入する。01〜06のPRごとに検証を拡張し、12-A2で一般受付のrequired checksを完成→12-Cで本番承認/昇格を運用開始する。各段階で権限と失敗時の停止を検証し、運用ドキュメントへ手順を残す。

## 完了条件・検証
- [ ] 12-A1でその時点の必須frontend/Go/build/testが動き、未実装テストを成功と偽らない。機能追加のPRで検証を順次拡張し、12-A2では一般受付全体の検証をrequired checksへ反映する。外部PRにCloud/prd秘密値を渡さない。
- [ ] 通常のGoテストだけでDB統合テスト済みと扱わず、専用PostgreSQLと主要一般受付E2Eの結果を表示する。
- [ ] main更新でmerge後SHAのイメージを一度build/publishし、devへ自動配布する。SHA/digest/run ID/検証結果を追跡できる。
- [ ] dev配布やmigration/smoke失敗の候補をprdへ昇格できない。
- [ ] prdは承認前にdeploy/migration権限を取得せず、承認拒否/期限切れでは変更しない。
- [ ] 承認対象・devで検証した候補・prdに配布するdigestが一致する。承認後の再buildやlatest解決で別イメージにならない。
- [ ] 承認待ちのmain/dev更新、同時push、古いrun完了、再試行でも候補差替え/無承認配布/環境巻戻しを防ぐ。
- [ ] dev/prdのDB/secret/roleが分離され、migrator/runtimeの分離を維持する。ログやartifactに秘密値・実データを残さない。
- [ ] health/smoke後のtraffic切替と復旧を専用環境で確認し、破壊的DB rollbackや開催中resetに依存しない。
- [ ] Pushなし・単一Go配布・Connect-RPC/PostgreSQL/sqlcを維持し、今回の延期機能をCI導入のために必須化しない。

## 段階ごとの成果物

| 段階 | 前提 | 完成するもの |
|---|---|---|
| 12-A1 | 11-Eと既存testコマンド | PR build/test/smokeと必須チェックの初期セット |
| 12-B | 12-A1、11-A/B/C/E/F | main build/publish、テスト専用devへの自動配布・固定digest記録 |
| 12-A2 | 01〜06、11-D一般受付分 | 基本受付E2E/DB競合/期限削除を含む最終required checks |
| 12-C | 12-A2/B、一般受付リリース条件 | 承認付きprd昇格・固定候補・失敗/復旧試験 |

12-Cの設定/拒否ケースの試験は早期に準備できるが、本番trafficの有効化は上記の前提を守る。main→devは任意機能の実装待ちにせず、未完成の機能はflag/APIで無効の候補として検証する。

## 主な変更候補

将来の `.github/workflows/`、GitHub Environments/branch保護と必須チェック、Google CloudのOIDC/IAM/registry・dev/prd配布設定、11が定義するbuild/test/migration entrypoint、docs/operation/。workflow名とjob名は実装時に確定し、同じ手順をworkflowとローカルで二重実装しない。

## 移行・分割方針

12-A1の初期PR CIと12-Bのdev配布を基本機能実装と並行して使い始める。12-A2の基本機能検証と11-D一般受付分を確認してから12-Cのprd承認/昇格を運用開始する。手動配布の停止/残す復旧経路を定義し、GitHubからしか運用できない未検証状態へ一度に切り替えない。既存Cloud Run/DB/秘密値の作成や変更は本計画の実装段階で行う。

## 実装前に具体化する事項

GitHubの利用プランとEnvironment保護の可用性、承認担当/自己承認方針、dev/prdの実リソース名とOIDC信頼条件、registryとartifactの保存期間、保護対象branch/必須チェック名、migration実行環境、候補の有効期限と古い候補の扱いを決める。いずれも計画作成だけで設定しない。

## 公式資料

- [GitHubのEnvironmentと配布保護](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments): 承認とEnvironmentの権限境界を確認する。
- [Google Cloud向けOIDC](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-google-cloud-platform): 長期鍵を持たない認証の設定を確認する。
- [Workflow concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency): 環境別配布の直列化と取消方針を確認する。
