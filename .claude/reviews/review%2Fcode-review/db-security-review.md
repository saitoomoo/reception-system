# reception-system DBセキュリティ設計調査

- 調査日: 2026-11-03（Asia/Tokyo）
- ブランチ: `review/code-review`
- HEAD: `9d2a40c2c3a602372b09945ca43bb97e6442d781` と現在の未コミット変更。
- 対象: migration全6組、全queryファイル、関連repository/handler/seed、接続・起動・Docker設定、保存仕様、既存機能別計画。
- 方法: code-reviewの3担当（制約/整合性、アクセス権限/機密情報、可用性/削除）を並列実行し、親が統合・根拠照合した。
- 実DB・実.env・実データ・秘密値・本番管理画面は確認していない。DBへの接続・変更・攻撃検証は行っていない。
- 保存のみ。アプリ実装・schema・`.codex/plan/` 内の計画ファイルは変更していない。

## 結論

現状は単一イベント・共通DB接続・アプリ側の権限制御を前提とした構成。外部キーや一部の一意制約、パスワードのbcrypt保存はあるが、最小権限・接続先検証・関係するレコード同士の一致・データ最小化に改善余地がある。

外部キーがあることだけで操作権限やブースの一致は保証されない。一方、DB制約がないことだけから外部利用者が任意データを書けるとも判断しない。現在のAPI到達性、権限のある管理操作での誤設定、DB資格情報漏洩時の被害範囲、将来の複数イベント対応を分けて評価した。

本調査のDB番号は設計事項の識別子であり、前回レビュー23件に追加して脆弱性件数を増やすものではない。F01/F07/F08/F19/F23など既知の原因は既存指摘へ対応付ける。

## 優先して対応する事項

| ID | 項目 | 確認できたこと | 条件・限界 | 推奨する計画 |
|---|---|---|---|---|
| DB01 | DB更新と通常運転の権限共有 | migration/runtimeが同じ接続変数を使う | 本番の実際のロール属性は未確認 | 11へ権限分離を追加 |
| DB02 | 接続先の証明書検証 | 仕様書のsslmode=require例は完全な接続先検証にならない | 実接続文字列/CA設定は未確認 | 11へTLS検証条件を追加 |
| DB03 | 複数テーブル間の帰属・一意性 | 入場/券/グループ/sessionの対応を独立FKだけでは保証しない | 現行の通常APIは一部をtxと導出IDで保護 | 03/04/08へ制約・単純化を追加 |
| DB04 | 管理者ログイン名の重複 | nameが非unique、seedは検索後INSERT | seed並列/手動投入時。公開管理者登録APIは未確認 | 01または04の管理基盤へ追加 |
| DB05 | 値域と処理量の上限 | 数値CHECK・管理設定検証が不足 | 公開発行の大量入力は既存F07に集約 | 01/03/07/08、実行予算は11へ |
| DB06 | 保存情報とエラーへの再記録 | 氏名/IP/年齢等とPush情報を保存、送信エラーを無加工保存 | 取得目的・DB閲覧権限・本番暗号化は別途確認 | 06/07/09へ具体条件を追加 |
| DB07 | イベント分離・期限削除 | 現schemaにevent境界なし、期限削除は未実装 | 単一イベントなら欠如だけで漏洩とはしない | 01/02/06の既存計画を実施 |

## DB01. DB更新用とアプリ実行用の接続を分ける

根拠: [entrypoint.sh:7](../../../backend/entrypoint.sh#L7) は `DATABASE_URL` でmigrationし、同じ環境のserverは [main.go:36](../../../backend/cmd/server/main.go#L36) でその変数からpoolを作る。seedも同名の変数を使う。repo内には実行ロールへのGRANT/REVOKE管理がない。

この起動方式でmigrationを正常実行できる資格情報は、そのschema更新に必要な権限を持つ。通常APIプロセスにもその資格情報を渡すと、アプリ侵害や資格情報漏洩時にschema改変まで被害が広がる。変数名が同じという理由だけで、本番がsuperuserとは判定していない。

対策は、migrationの実行場所を先に決め、owner/migratorとruntimeのロール・秘密値を分離すること。runtimeは実機能に必要な表のDML・sequence使用に絞り、CREATE/ALTER/DROP・ロール作成・不要schema操作を許さない。管理者seedも一時的な管理実行経路とする。単に接続変数を2つに分けても同じ強権限roleなら効果はない。最小権限の考え方は [OWASP Database Security](https://cheatsheetseries.owasp.org/cheatsheets/Database_Security_Cheat_Sheet.html) を参照。

既存の **11-safe-migration** に組み込み、F23の「更新失敗を無視」とは別の受入条件にする。専用DBでruntimeによる正常発券/入場/通知が成功し、DDLとロール作成が拒否されることを検証する。

## DB02. 通信暗号化と接続先検証を別に確認する

根拠: [infrastructure.md:195](../../../docs/spec/infrastructure.md#L195) と203行の例は `sslmode=require`。利用中のpgx v5.7.3のconfig実装も読み、架空の接続文字列をParseConfigするだけのローカル確認を実施した。実DBへの接続は行っていない。

- CA関連環境設定を外した `require`: TLSあり、既定の証明書検証をスキップ、独自検証なし。
- 同じ架空hostの `verify-full`: TLSあり、既定の証明書検証をスキップしない。

`require` はCA設定によって挙動が変わり得るため、上記は指定条件での結果。実際の本番URLやCA設定は未読で、本番の中間者攻撃の成立を実証したものではない。接続先の証明書チェーンとホスト名を検証する設定を本番の基準とし、migrator/runtime双方で確認する。モードの意味は [PostgreSQL 16 SSL](https://www.postgresql.org/docs/16/libpq-ssl.html) と、実際に利用するドライバーの設定を合わせて判断する。

**11-safe-migration** に、正しい証明書/ホストでは接続し、不正証明書・ホスト不一致・平文接続は拒否する検証を追加する。

## DB03. 外部キーだけでは帰属の一致を保証しない

根拠は [initial migration:94](../../../backend/migrations/000001_initial_schema.up.sql#L94)、128〜143行、174〜181行。

| 関係 | DBが現在許す不整合 | 簡易システム向けの対策 |
|---|---|---|
| ticketsとticket_groups | 券Aのgroup参照が、券Bを逆参照するgroupでも各FKは通る | group→ticketの単方向へ整理する案を優先。一般受付の人数をticketsに置く案も03/07で比較 |
| admissionsとtickets | 存在する別visitor/boothを組み合わせた入場記録、同じ券への複数入場行 | 1券1入場ならUNIQUE(ticket_id)。visitor/boothを券から導出するか、残す場合は複合FKで一致を保証 |
| ticketsとmatch_sessions | 券と別boothのsessionを関連付けられる | 対戦有効時はsessionの(id, booth_id)と券の対応を複合FKで保証する案 |

現在の通常発行・通常入場はサーバーがIDを導出し、tx内で処理している。そのため、この表の制約不足だけで、一般APIから任意のgroup/他ブース入場を作れるとは判定していない。意図する関係がDBに表現されていないため、将来の修正・移行ミスを検出できないという問題。

追加制約は既存データの不整合件数を確認してから導入する。他行/他表に依存する規則を単純なCHECKに押し込まず、UNIQUE/複合FK/txを使い分ける。[PostgreSQL 16 Constraints](https://www.postgresql.org/docs/16/ddl-constraints.html) を参照。

status文字列のCHECKは「completedからin_progressへ戻れない」ことまでは保証しない。F09/F10/F11の競合や状態逆行は条件付き更新とtxで別途修正する。汎用状態遷移triggerの導入を今回必須にはしない。

## DB04. 管理者ログイン名を一意にする

根拠: [initial migration:8](../../../backend/migrations/000001_initial_schema.up.sql#L8) のnameに一意制約がなく、[seed/main.go:59](../../../backend/cmd/seed/main.go#L59) は検索→bcrypt→INSERTする。認証はnameで1行取得する。

同じ名前のseed並列実行や手動投入で別hashの同名行が生じると、認証対象が不定になり運営ログインが不安定になる。外部利用者が管理者を自由に作成できるという指摘ではない。

既存重複と名前の大小文字/空白の扱いを決め、UNIQUEを追加する。seedはconstraintを根拠に競合を扱い、既存のパスワードを自動上書きしない。**01-event-settings** または **04-staff-operations** の管理認証準備へ小項目として含める。

## DB05. 基本値域と可用性の制限を置く

[initial migration:37](../../../backend/migrations/000001_initial_schema.up.sql#L37) 以降の設定値には正数・非負・時刻の前後関係のCHECKが乏しく、[admin/handler.go:545](../../../backend/internal/feature/admin/handler.go#L545) の管理APIも多くの数値をそのままSQLへ渡す。人数、sequence、target/min、cooldown、open/close等に適切な値域が必要。

管理者の誤設定やAPI操作で負の待ち時間、即時の不在扱い、不正な受付期間などを保存し得る。これは管理権限の迂回とは分けた整合性/可用性の問題。

公開発行の人数上限不足は既存F07。人数比例のparticipants INSERTや可変長文字列の保存量を抑えるため、API総サイズ・文字列長・人数・受付上限を明示する。DBには変わりにくい正数/範囲CHECKを置く。窓口設定と人数の動的比較はアプリの共通検証/txへ置き、一般受付では不要な個人行を作らない。**01/03/07/08** へ反映する。

コード上はquery/lockの実行予算が明示されていない。ただし本番DBのrole設定・接続パラメータで指定されている可能性があり、「本番timeoutがない」とは判定できない。poolにもpgxの既定上限があり、無制限とはしない。**11** でrequest/worker、statement/lock/idle-in-transactionの予算と、接続上限×最大インスタンス数を確認する。migration/exportには用途別の予算を使う。[PostgreSQL 16 Client Defaults](https://www.postgresql.org/docs/16/runtime-config-client.html) を参照。

## DB06. 保存情報と失敗記録を最小化する

[initial migration:148](../../../backend/migrations/000001_initial_schema.up.sql#L148) 以降に参加者名/年齢、保護者名/IP/User-Agent/同意文面、62行以降にPush endpoint/auth情報を保存する。現在のHMD用途で必要な記録かは別途判断し、すべてを直ちに不要・不適切とは断定しない。

新しい一般受付の「個人情報不要」方針に合わせ、**02/03/06/07** で一般受付がこれらの行や名前/PINのダミー値を作らないschemaに移す。HMDだけ必要な項目・目的・期間を確定し、期限削除する。保存時暗号化やバックアップ暗号化の実状態は未確認。TEXT列であることだけを脆弱性とせず、削減・アクセス制限・保管期間を優先する。

追加の具体的注意点はPushの失敗記録。[worker.go:155](../../../backend/internal/feature/notification/worker.go#L155) はsend errorの文字列を渡し、[repository.go:100](../../../backend/internal/feature/notification/repository.go#L100) がerror_messageへ無加工保存する。HTTPエラーはURLを含む場合があるため、購読endpointの秘密のpathを通知ログへ再記録する可能性がある。外部へ公開されることまでは確認していない。

外部接続を行わないfake HTTP transportで、GoのHTTPエラーに架空endpointのpathが含まれることを確認した。**09-web-push-option** にエラー分類・URL/秘密値の除去・保存長上限を追加する。先頭30文字だけの切り取りも全てのURLで安全とは保証しない。Pushの配信に必要な情報は読み戻す必要があるため、全項目を単純にハッシュ化する計画にはしない。

## DB07. イベント境界と期限削除はこれから実装する

現在のschemaにevents/event_idがなく、全件export/非本番resetはDB全体が対象。単一イベントの専用DBとして使う限り、それだけで別イベント漏洩があるとはいえない。新方針の「イベント限定パス」を共有DB上で運営するなら、イベント→受付主体/パス→券/窓口/session/通知の関連と、跨イベント参照を拒否する制約が必要。**01/02/06** の既存計画に含める。

RLSはrepoにないが、未導入だけで欠陥とはしない。初期は最小権限・アプリのイベントscope・複合FKを揃え、複数主催者/DBアクセス経路増加時に追加防御として再評価する。導入時は所有者等のbypassと、接続pool上のイベント文脈の設定漏れ/残留も検証する。[PostgreSQL 16 Row Security](https://www.postgresql.org/docs/16/ddl-rowsecurity.html) を参照。

現在のResetEventDataは管理者session・環境・確認文字を検証する非本番の全消去。循環FKがあるが、tickets→groupsが遅延制約であり、削除順は静的には成立する。「循環しているから全削除できない」「無認証で本番全消去できる」とは判定しない。一方、これを本番のイベント別期限削除の代用にはできない。

**06** にイベント別削除・再実行・進捗・worker競合、対象索引を実装する。CSVやバックアップの保持はDB削除と別に管理し、復元で削除済みデータが戻る場合の扱いも定める。

## 既にある防御

- PIN/スタッフ/管理者のパスワードはbcryptで生成・比較しており、生パスワードをDBへ保存する実装ではない。
- 受付番号にUNIQUE、active券の(visitor_id, booth_id)に部分UNIQUE、同意のparticipant_idにUNIQUEがある。
- 年齢0〜120とstatus/modeの許容値にCHECKがある。
- 通常入場は条件付き券更新と入場INSERTを同一txで処理する。
- 調査したsqlc/pgxの入力値はパラメータ化。IDORは既存F01のアプリ権限問題として扱い、SQL注入を確認したとは言わない。

## 計画への追加案

現時点では新しい大規模DB再設計planを増やさず、既存feature内へ責務を置くことを推奨する。

| 既存計画 | 追加する具体作業 | 完了確認 |
|---|---|---|
| 11 安全な移行 | migrator/runtime/seed権限分離、TLS接続先検証、実行/接続予算 | runtimeでDDL不可、正常DML可。不正証明書拒否。待ち時間上限で接続が戻る |
| 03 一般発券 | 循環関係の単純化、正数/一意制約、入力量上限 | 不正な関係/人数/重複番号をDB/APIで拒否 |
| 04 スタッフ | 入場の一意性と券との帰属整合 | 別visitor/boothの不一致を拒否。正常入場は1回だけ |
| 01 管理設定 | 設定値域、管理者name一意とseed競合処理 | 不正値/同名管理者を拒否、既存hashを上書きしない |
| 08 対戦 | 券とsessionの同一窓口制約、tx状態ガード | 別窓口sessionを拒否し、二重操作でも状態一貫 |
| 06/07 保存・HMD | 必要項目・期限・イベント別削除・バックアップ運用 | 一般受付で不要情報ゼロ、期限後に個別情報が残らない |
| 09 Push | 失敗理由の分類・URL/秘密値除去、保存長制限 | HTTPエラーでendpoint秘密部分が通知ログへ残らない |

11の権限/接続保護が大きくなる場合は独立した機能計画へ切り出せるが、今回の調査だけでは新ファイルを追加していない。既存の23指摘の対応完了や、計画の実装済みを意味しない。

## 実環境の確認事項

次の項目はrepoから確定できない。実施する際は資格情報や個別データを表示せず、権限・設定・不整合の件数に絞る。

- 実roleのowner/superuser/CREATEROLE/BYPASSRLS属性、schema/table/sequenceのGRANTとPUBLIC/default privileges。
- 本番の接続先証明書検証、許可ネットワーク、Neonアクセス権限、資格情報の保管・更新方法。
- DB/role/URLのtimeoutとpool上限、Cloud Run最大インスタンス数、background worker設定。
- バックアップの暗号化/閲覧権限/保存期間と、PIIを含む開発ダンプの扱い。
- 現存データの重複番号・同名管理者・帰属不一致の件数。

composeはローカルsmoke-test用途。DBのhost公開IPを限定しないport mappingは、共有ホストやLANで使う際にlocalhost bind/ネットワーク制限を検討する。本番が同じ公開構成とは推定しない。

## 専用DBで実施する検証（未実行）

- runtime用roleで必要な発券/入場が成功し、CREATE/ALTER/DROP/role作成が拒否される。
- 誤ったTLS証明書/hostを拒否する。
- 不一致なgroup/visitor/booth/session、重複入場、不正な値域をDBが拒否する。
- 正常な発券/入場/match、並列操作、既存データ移行を壊さない。
- deadline超過・lock待ち・pool取得待ちから回復し、削除の途中失敗後に再実行できる。

不整合件数の確認SQL案（未実行、名前や秘密値を返さない）:

```sql
SELECT count(*) AS inconsistent_ticket_groups
FROM tickets t JOIN ticket_groups g ON g.id = t.ticket_group_id
WHERE g.ticket_id <> t.id;

SELECT count(*) AS inconsistent_admissions
FROM admissions a JOIN tickets t ON t.id = a.ticket_id
WHERE a.visitor_id <> t.visitor_id OR a.booth_id <> t.booth_id;

SELECT count(*) AS duplicate_admission_groups
FROM (SELECT ticket_id FROM admissions GROUP BY ticket_id HAVING count(*) > 1) x;

SELECT count(*) AS cross_booth_match_assignments
FROM tickets t JOIN match_sessions s ON s.id = t.match_session_id
WHERE t.booth_id <> s.booth_id;

SELECT count(*) AS duplicate_admin_name_groups
FROM (SELECT name FROM global_admins GROUP BY name HAVING count(*) > 1) x;

SELECT count(*) AS duplicate_sequence_groups
FROM (SELECT booth_id, sequence_in_booth FROM tickets
      GROUP BY booth_id, sequence_in_booth HAVING count(*) > 1) x;
```

このSQLが未実行であることと、不整合が実DBに存在するかは区別する。追加制約は既存データの確認・一般受付モデルの確定後、追加migrationで導入する。
