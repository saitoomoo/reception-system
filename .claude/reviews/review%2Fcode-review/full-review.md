# reception-system 全体レビューと修正計画
- レビュー日: 2026-11-03（Asia/Tokyo）
- 修正計画更新: 2026-11-03。ユーザー指定の「個人情報不要の受付パス＋一般的な順番待ち受付、HMD機能はオプション」を反映。
- 対象ブランチ: `review/code-review`
- HEAD / origin/main: `9d2a40c2c3a602372b09945ca43bb97e6442d781`
- 対象: このHEADに未コミットの画面変更とレビュー設定を含むソース全体。ユーザー指定により差分限定から既存実装も含む全体調査へ拡張した。
- 前回の差分レビューは `code-review.md` に保持。本書でその指摘も再掲し、二重計上していない。
- 対象差分SHA-256: `e854b5a641dda33d09ae32828a351a70e13085c4712fa21545103306913ea5aa`。ソース全体はsnapshotのファイルハッシュで照合した。
- 保存のみ。コード修正・commit・push・PR投稿は実施していない。

## 📝 変更内容と調査範囲

今回の未コミット実装変更はブース詳細の待ち表示と受付/status導線の削除。これに加え全体の本人確認・発行・入場・マッチング・通知・運営集計をレビューした。追加したAGENTS/レビュー適用ガイドも参照した。

規約・正しさ／セキュリティ／性能の3担当を並列実行し、親が根拠を照合して統合した。バックエンド全featureの主要経路、queries/migrations、関連proto、主要画面・hooks・Push・Service Worker・server/Docker/起動処理が対象。生成物は契約照合用とし、dist、node_modules、画像、録画・CSV・実.env・既存ログは通常意味レビューから除外した。

全UI子部品・生成コード・全テストの全行を網羅した保証はない。本番環境/IAM/出口制御、実負荷、ブラウザ動作は未確認。

## 📊 サマリー
- 規約・正しさ、セキュリティ、パフォーマンス: 3観点完了（主に静的レビュー）。
- 🔴 要修正: P1 **15件** / P0 0件。
- ⚠️ 改善推奨: P2 **8件** / P3 0件。
- レビュー時点の独立した根本原因: **23件**。新方針の実装計画は**11機能**へ再編し、`.codex/plan/` の個別ファイルで管理する。旧U00〜U15との対応は計画一覧に保持。
- 指摘の優先度・件数と実行済み検証は当初レビュー時点の記録。オプション無効時は該当経路を利用対象外にできるが、未修正の指摘を解決済みにはしない。
P1は全員・同時操作・特定設定等の発生条件ごとに優先度を判定したもので、全件が現在の本番で再現済みという意味ではない。P2にも不正通知や式評価など実害がある。lintのerror/warn数ではない。

✅ 確認した準拠事項: 5項目。

1. staff/admin CookieにはHMAC署名・期限・HttpOnly/Secureがある。
2. 調査したAdmin変更/削除/export/resetには管理者session検査がある。
3. 通常のスタッフ/admission/match経路はsession由来BoothIDを使用している（F16の例外を除く）。
4. 調査したsqlc/pgx経路はパラメータ化され、文字列連結によるSQL注入は確認しなかった。
5. ガイドは現物のVite SPAとNext.js想定規約の差異を明示し、参照リンクは解決する。

### 実行した検証

- 隔離snapshotのbackendで `GOCACHE=/private/tmp/reception-review-go-cache GOPROXY=off go test ./...`: 成功。admin/match/notification/visitorの通常テストを含む。
- 隔離snapshotのfrontendで既存依存を利用し `npm run build -- --outDir <一時出力先>`: 成功。大きいJS chunkの警告あり（約896KB、gzip約262KB）。Vite buildは型検査/lintの成功を意味しない。
- 起動scriptを一時領域へコピーし、migrateをexit 42・serverをマーカー出力の代替コマンドへ置換: migration失敗後もserver起動・終了値0となることを確認（F23）。実DB接続なし。
- `git diff --check`: 成功。保存前にHEAD・ブランチ・ソースハッシュを照合した。

DB統合テストは `integration` タグが必要なため通常のgo testに含まれていない。Docker/PostgreSQL統合テスト、E2E、負荷試験、脆弱性スキャンは未実施。テスト成功だけではF01等の認可・同時操作の安全性を裏付けない。

## 観点別指摘リスト

各指摘の確信度は高。ただし静的な因果関係の確認が主で、動的再現済みは別途明記している。F03以外は今回の未コミットUI差分以前から存在する問題。

### セキュリティ

#### F01 [P1] 整理券を操作する権限を検証せず他人の情報を操作できる

場所: [backend/internal/feature/ticket/handler.go:44](../../../backend/internal/feature/ticket/handler.go#L44)。観点: セキュリティ。

visitor/ticket RPCは本文のvisitor_idを信頼する。AuthenticateVisitorはIDを返すだけでセッションを発行しない。第三者がListMyTicketsで他人のticketを取得し、そのvisitor_idを添えCancelTicketできる。Push購読の上書き・プロフィール取得も同型。所有者IDと本文IDの一致は本人確認にならない。公開の受付番号照会仕様とは区別する。

修正方針（更新）: 個人情報の入力なしにイベント限定の受付パスを自動発行し、取消・非公開照会・通知設定はパスから導いた権限で検証する。実名確認や会員登録は導入しない。受付番号や本文visitor_idだけでは操作権限を付与しない。詳細は機能計画02（匿名受付パス）。レビュー時の根拠は既存ticket仕様§6で、新仕様への改訂は機能計画01（イベント設定）で行う。

完了確認（更新）: 名前・メール・電話・PINなしで発券でき、有効な受付パスで自分の券だけを照会・取消できる。他イベントのパス、受付番号のみ、任意のvisitor_idでは非公開操作を行えない。

#### F02 [P1] Push endpointから内部HTTP宛先へ要求を送信できる

場所: [backend/internal/feature/visitor/handler.go:82](../../../backend/internal/feature/visitor/handler.go#L82)。観点: セキュリティ。

endpointと鍵は非空検査のみで、DBからworkerのHTTP送信へそのまま流れる。有効なVAPID設定・Push暗号鍵・通知発生を条件に、内部到達可能な宛先への暗号化POSTが成立する。受付パスによる操作権限の検証を導入しても、自分の購読で成立する。応答窃取や資格情報窃取まで可能とは確認していない。

修正方針: 運用providerのHTTPS宛先方針を定め、送信時にもprivate/link-local等の接続先とredirectを制限する。登録時のホスト名検査だけにしない。

完了確認: 非HTTPS、内部IP、内部へのredirect、DNS解決先変更を拒否し、許可providerが成功する。

#### F16 [P2] 別ブースの呼出済み券へスタッフが再通知できる

場所: [backend/internal/feature/booth/repository.go:167](../../../backend/internal/feature/booth/repository.go#L167)。観点: セキュリティ／正しさ。

booth条件付きUPDATEが0行でも後続SELECTはIDだけ。別ブースのcalled券を指定すると成功扱いでhandlerがcall_initialをenqueueする。

修正方針: 条件付きUPDATE RETURNING visitor_idで実際に更新した券だけ通知する。0行は失敗扱いにする。

完了確認: 他ブース・既called・同時2呼出しで余分な通知なし。

#### F17 [P2] CSVに公開入力が表計算式として出力される

場所: [backend/internal/feature/admin/handler.go:389](../../../backend/internal/feature/admin/handler.go#L389)。観点: セキュリティ。

ニックネームは長さ検査だけで式先頭を許し、CSVへ無加工出力する。Excel等で開くと式として評価される。コード実行や外部通信の可否は製品設定依存で断定しない。

修正方針: CSV出力境界でユーザー由来の文字列セルを安全化する。引用符によるCSV構文エスケープと式無効化を区別する。

完了確認: 式プレフィックス・制御文字と通常の日本語/引用符/改行の扱いを確認する。

### 規約・正しさ・業務整合性

#### F03 [P1] 初回来場者の予約導線が消失する【今回の差分】

場所: [frontend/src/screens/booth-detail/index.tsx:83](../../../frontend/src/screens/booth-detail/index.tsx#L83)。観点: 規約・正しさ。

詳細の「受付へ」「現在の待ち状況」が両方削除された。一覧は詳細へ遷移するため、未登録利用者は通常UIから予約に進めない。status画面に予約ボタンが残っていても入口がない。根拠: ticket仕様§4/§5-2。

修正方針: 予約またはstatusへ進むボタンか代替導線を同じ変更で用意する。

完了確認: 未登録で一覧→詳細→整理券取得完了へ進める。

#### F04 [P1] 再ログインでvisitorIdを保存せず本人の一覧が取得されない

場所: [frontend/src/screens/login/index.tsx:28](../../../frontend/src/screens/login/index.tsx#L28)。観点: 規約・正しさ。

AuthenticateVisitorはvisitorIdを返すがloginへ渡さない。storage消失後はvisitorId=nullでmypageのQueryが無効、通知設定も動かない。古いIDが残る場合はアカウント切替の不整合も起こる。

修正方針（更新）: 一般受付はPIN再ログインを廃止し、受付パスのサーバー検証によって状態を復元する。旧方式を移行中に残す場合だけ返却visitorIdの欠落も修正する。旧localStorageのIDを、新しいパスの所有権の証拠として信頼しない。

完了確認: storage空からの再ログインと別アカウント切替で正しい本人情報を表示する。

#### F05 [P1] 登録済み利用者が別ブース選択からマイページへ戻される

場所: [frontend/src/screens/booth-select/index.tsx:27](../../../frontend/src/screens/booth-select/index.tsx#L27)。観点: 規約・正しさ。

mypageの「ブース選択へ」は / へ進むが、一覧のeffectが認証済み利用者を直ちに /mypage へ戻す。R-006の複数ブース取得を通常操作で行えない。

修正方針: 認証済みでもブース一覧を操作できるようにし、初期遷移と選択ルートの役割を整理する。

完了確認: 登録済み利用者が別ブースの整理券を取得できる。

#### F06 [P1] 7〜9歳を含む初回利用者の手動受付が進まない

場所: [frontend/src/screens/register/index.tsx:116](../../../frontend/src/screens/register/index.tsx#L116)。観点: 規約・正しさ。

visitor作成前にスタッフ案内へ進み受付番号がない。一方、手動発行は既存受付番号が必須（admin/manual_ticket_handler.go:99–117）で、スタッフ画面にもvisitor作成経路がない。R-005の特殊フローが完結しない。

修正方針: visitor登録とticket発行の境界を分離するか、スタッフによるvisitor登録を設ける。子供をオンライン発行させる回避策にしない。

完了確認: 未登録の家族→受付番号→紙＋デジタル同意→スタッフ発行が完了する。

#### F07 [P1] 人数・モード制約をサーバーが強制しない

場所: [backend/internal/feature/ticket/repository.go:119](../../../backend/internal/feature/ticket/repository.go#L119)。観点: 規約・正しさ／セキュリティ。

private最小人数以外のmax participants、individual=1人、public人数上限、allow_private_match、ブース種別とmatch_modeの対応を十分検証しない。UIを迂回すると上限超過やマッチ対象外の券を作れる。手動経路も共通検証がない。根拠: R-015/R-016、match仕様§4。

修正方針: ブース設定を使う発行条件を共通検証にし、通常・手動の両経路で適用する。

完了確認: 各体験タイプの人数/モード境界値と不正組合せをAPIテストで拒否する。

#### F08 [P1] 同時発行で整理券番号が重複する

場所: [backend/queries/ticket.sql:81](../../../backend/queries/ticket.sql#L81)。観点: 規約・正しさ。

通常/手動発行ともロックなしのMAX(sequence_in_booth)+1。別visitorの同時txが同じ値を読み両方成功する。booth_sequence indexは非unique。順位COUNTの < sequence でも同番号の先客を数えなくなる。

修正方針: 両発行経路でブース単位の採番をtx内で直列化する。既存重複を確認後、一意制約やcounter方式を設計する。

完了確認: 通常×通常、通常×手動の並列発行で番号と順序の一意性を確認する。

#### F09 [P1] キャンセルと入場の競合で入場済み状態を巻き戻す

場所: [backend/internal/feature/ticket/repository.go:339](../../../backend/internal/feature/ticket/repository.go#L339)。観点: 規約・正しさ。

Cancelは状態読取後にIDだけの無条件UPDATE。called読取→admit commit→cancel更新でadmissionsはあるのにticketはcancelledとなる。クールダウン参照にも影響する。根拠: R-014。

修正方針: 所有者と許可元状態を含む原子的な条件付き更新にし、実際の更新行を確認する。

完了確認: cancel/admit競合で片方だけ成功し、ticket/admissions/クールダウンが一致する。

#### F10 [P1] 同時マッチングが同じ券を別セッションへ上書きする

場所: [backend/internal/feature/match/service.go:70](../../../backend/internal/feature/match/service.go#L70)。観点: 規約・正しさ。

選出がtx外。自動×自動や自動×強制で同じ待機リストを選び、AssignTicketsToMatchSession（ticket.sql:224–228）は未割当/状態条件なしで上書きする。空のin_progress sessionが残る。

修正方針: 選出・割当・session作成を同じtxと排他の中で行い、未割当条件と更新件数を検証する。

完了確認: 自動×自動、自動×強制、cancel競合で1ticket=1sessionかつ孤立sessionなし。

#### F11 [P1] マッチの完了・再呼出しで不正な状態へ戻せる

場所: [backend/internal/feature/match/repository.go:185](../../../backend/internal/feature/match/repository.go#L185)。観点: 規約・正しさ。

CompleteSessionは元session statusを検証せず、完了の再実行でadmitted_atを書き換える。tx前の読取後にcancelされた券をadmittedへ戻せる。CallSessionTicketsもcompleted sessionをin_progressへ更新できる。

修正方針: sessionとticketの許可元状態をtx内で検証・ロックし、更新結果を確認する。再実行の冪等性を定義する。

完了確認: 二重完了、完了済み再呼出し、cancel×完了で状態逆行や時刻書換えが起きない。

#### F12 [P1] マッチの呼出しが初回Push通知を作成しない

場所: [backend/internal/feature/match/repository.go:124](../../../backend/internal/feature/match/repository.go#L124)。観点: 規約・正しさ。

自動・強制publicとprivate呼出しでcalledにするが、BulkCallMatchTicketsのvisitor_idを捨てservice/handlerにもenqueueがない。画面を閉じた利用者に初回呼出しが届かない。根拠: match仕様§5-1/§5-3。

修正方針: 実際にcalledへ遷移した券に通知記録を作る。状態更新との原子性と再試行時の重複を扱う。

完了確認: public自動/強制/privateの各呼出しで対象通知が1件作られる。

#### F13 [P2] マッチ完了が入場記録を作らず集計・CSVから欠落する

場所: [backend/internal/feature/match/repository.go:210](../../../backend/internal/feature/match/repository.go#L210)。観点: 規約・正しさ。

通常入場と違い、ticketをadmittedにするだけでCreateAdmissionがない。admissionsを使う入場数・入場CSVからマッチ参加者が欠落する。

修正方針: 許可された完了遷移と入場記録を同一txにし、通常入場済み・二重完了でも二重作成しない。

完了確認: ticket/admissions/管理集計/CSVが一致し、再完了でも入場記録が増えない。

#### F14 [P2] 待ち人数と時間を整理券枚数で計算している

場所: [backend/queries/booth.sql:14](../../../backend/queries/booth.sql#L14)。観点: 規約・正しさ。

COUNT(*)の券枚数を「人」と表示し、人数あたりの時間式へ渡す。5人組1券・1人10分のsequentialでは1人/10分となる。また一覧/詳細の集計はpendingを含みstatus側は除外する。根拠: ticket仕様§3、R-012。

修正方針: 券数と参加人数を区別し、体験タイプ別の集計とpending除外を揃える。

完了確認: 複数人グループ、parallel容量境界、pending化、一覧/詳細/statusの一致を確認する。

#### F15 [P2] 通知登録の失敗やスキップを有効と表示する

場所: [frontend/src/screens/register/complete/index.tsx:27](../../../frontend/src/screens/register/complete/index.tsx#L27)。観点: 規約・正しさ。

subscribePushのfalseを無視してdoneにする。スキップも同じdoneを使い「通知が有効」と表示する。利用者が届かない通知を待ってしまう。

修正方針: 購読成功・拒否・失敗・スキップを別状態とし、結果に対応した表示にする。

完了確認: VAPID未設定、登録失敗、許可拒否、スキップ、成功で表示が一致する。

### パフォーマンス・通知

#### F18 [P1] 1件の無応答Pushが後続通知を無期限に止める

場所: [backend/internal/feature/notification/worker.go:126](../../../backend/internal/feature/notification/worker.go#L126)。観点: パフォーマンス／セキュリティ。

全通知を直列送信しctxはプロセス寿命。HTTPClientも送信ごとの期限も未指定。webpush-go v1.4.0は既定でTimeoutなしのclientを使う。接続後に応答しない宛先で処理全体が止まりretryも進まない。両担当の重複を1件へ統合した。

修正方針: 送信ごとの期限とHTTP client上限を設定し、失敗後に次へ進む。必要なら上限つき並列化を検討する。

完了確認: 先頭に無応答Senderを置き期限内復帰と後続送信・ctx取消を確認する。

#### F19 [P1] 複数workerが同じ通知を重複配信する

場所: [backend/queries/notification.sql:36](../../../backend/queries/notification.sql#L36)。観点: パフォーマンス／正しさ。

pendingの単純SELECT→外部送信→status更新でclaimがない。Cloud Run複数インスタンスや新旧共存時、同じ行を各workerが送る。各mainプロセスでworkerを起動する。

修正方針: 原子的batch claimとprocessing/lease回収を設計する。DBロックを外部送信中に保持しない。

完了確認: 2worker同時実行の排他と、claim後クラッシュからの回収を検証する。送信後DB記録前のクラッシュまでexactly-onceとは保証しない。

#### F20 [P2] マイページ更新が全履歴に2Nクエリを追加する

場所: [backend/internal/feature/ticket/repository.go:310](../../../backend/internal/feature/ticket/repository.go#L310)。観点: パフォーマンス。

全statusの履歴を取得し各券へboothと順位を逐次照会する。10秒更新ごとに1+2N往復し、終了済みにも順位COUNTする。履歴増加で転送と処理が増え続ける。遅延量は未測定。

修正方針: JOIN/集約で往復をまとめ、終了済み順位を省略する。active更新と履歴ページングを分ける。

完了確認: active/終了済み混在の互換性と履歴増加時のSQL往復数を確認する。

#### F21 [P2] 管理集計が件数のために全入場明細を取得する

場所: [backend/internal/feature/admin/repository.go:75](../../../backend/internal/feature/admin/repository.go#L75)。観点: パフォーマンス。

各ブースの当日入場明細をJOIN取得してlenだけ使い、ダッシュボードは10秒ごとに再実行する。人数が増えるほど不要な転送・割当が増える。

修正方針: DB側COUNT/集約へ変え、可能なら全ブース分を一括取得する。明細APIは用途を分ける。

完了確認: 0件・複数ブース・日付境界の件数一致と取得行数の上限を確認する。

#### F22 [P2] 遅い管理画面ポーリングが重複し古い結果で上書きする

場所: [frontend/src/screens/admin/index.tsx:60](../../../frontend/src/screens/admin/index.tsx#L60)。観点: パフォーマンス／正しさ。

async取得をsetIntervalで発火し前回完了を待たない。同型はmatch-queueとglobal-dashboard。5/10秒以上の遅延時にリクエストが蓄積し、応答の順序逆転で状態を巻き戻す場合がある。unmountで進行中fetchを止めない。

修正方針: Query管理へ統一するか、完了後再取得と実行中ガード/AbortSignalを導入する。

完了確認: 遅延応答でも最大同時数1、unmount取消、古い応答の非反映を確認する。

### 運用・デプロイ

#### F23 [P1] DB migrationの全エラーを無視してサーバー起動を続ける

場所: [backend/entrypoint.sh:7](../../../backend/entrypoint.sh#L7)。観点: 規約・正しさ／運用。

advisory unlockの特定問題を避ける目的だが、構文エラー・接続失敗・dirty schema等も || echo で成功化する。必要なschema更新なしで新serverが起動し、リクエスト時に不整合が表面化する。隔離した代替migrateをexit 42にしてserverが起動することを再現した。

修正方針: migration失敗は原則起動停止にする。direct接続や別migration job等を検討し、許容する例外は具体的に識別する。

完了確認: 失敗/dirty/接続不可でserver未起動、成功/変更なしで正常起動を確認する。

## 未確定の仕様・運用条件（指摘件数に含めない）

- 方針確定: 一般受付は名前・メール・電話・PIN・年齢・同意記録を必須にしない。既存のPII取得禁止の総論とR-005-2の差異は、HMDオプションの取得項目・保存目的・期間の仕様として機能計画01/07/06で整理する。氏名・IPの取得をそのまま全イベントの既定にしない。
- 一般受付はPINを使わない。既存PIN方式を移行中に提供する場合は試行制限・提供期限を機能計画02で定義する。受付パスの大量発行・発券への上限はイベント単位で設計する。
- CORSは許可外Originへ許可ヘッダーを返さないが要求自体を常に拒否するわけではない。SameSite=Noneだけで実証済みCSRFとは断定せず、Connectのpreflight等も含め機能計画02で検証する。
- 運営の「当日」はコードがUTCで区切っている。イベント運営のtimezoneの正典を確認し、必要なら機能計画05で補正する。
- Cloud Runの実際の複数instance設定、background CPU割当、ネットワーク出口制御は未確認。F19は複数プロセス時、F02は内部宛先へ到達可能な構成時に影響する。
- Cheerはサーバー連携の未実装部分と未決定仕様があり、完成扱いを避ける。今回の主要確定指摘には増やしていない。
- 欠落している `~/.claude/CLAUDE.md` の内容は推測して補っていない。

## 機能別の実装計画

2026-11-03、旧U00〜U15の16単位を、実装する機能ごとの11計画へ再編した。今後の計画の管理先は [`.codex/plan/README.md`](../../../.codex/plan/README.md)。各機能の対象・依存関係・実装手順・完了条件はその中の個別ファイルに記載し、本書では重複管理しない。

採用方針は「個人情報不要のイベント限定受付パス＋一般的な順番待ち受付」。新規イベントでは名前・メール・電話・ニックネーム・PIN・年齢・同意入力を不要とし、HMD・対戦・Pushは必要時だけ有効化する。既存HMD設定と有効券は移行中も保持する。

計画一覧には着手順、基本機能/オプションの境界、旧単位・23指摘との対応、移行と試験開始の条件を記載した。状態はすべて未着手で、計画の再編に伴うコード修正や新しいテスト実行は行っていない。

## 当初レビューの対象識別

以下は2026-11-03のコード調査時の記録。今回更新したのは修正計画とF01/F04の解決方針であり、コードの再レビューや修正完了を示すものではない。


ソースsnapshot manifest SHA-256: `1b2f91ff92fb73f4bef85abb31bf489204820639167beeaf45aad59457570222`。差分レビュー時から保存直前までソース変更なし。3担当の指摘のうち同じPush送信期限の問題をF18へ統合し、採番・マッチ競合の重複はそれぞれF08/F10へ統合した。
