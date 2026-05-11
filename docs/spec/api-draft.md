# API ドラフト（proto 定義の叩き台）

Figma Make 出力の画面分析をもとに導出した RPC 一覧。
実装着手前に `proto/` ファイルとして定義し、`buf generate` で生成物を作成する。

> **真実の源は `proto/` ファイル**。このドキュメントはあくまで設計の出発点であり、
> 実装中に変更が生じた場合は `proto/` を更新し、このファイルも追随して修正すること。

---

## 1. VisitorService

来場者の受付登録・認証・Push 購読を扱う。

| RPC 名 | 入力 | 出力 | 備考 |
|---|---|---|---|
| `CreateVisitor` | nickname, pin | visitor_id, reception_number | 受付番号（A-105 形式）を採番して発行。R-001, R-002 参照 |
| `AuthenticateVisitor` | reception_number, pin | visitor_id, reception_number | localStorage 消失時の再ログイン。R-004 参照 |
| `RegisterPushSubscription` | visitor_id, endpoint, p256dh_key, auth_key | - | Web Push 購読情報を登録。R-020 参照 |

---

## 2. BoothService

ブース情報の参照・設定を扱う。

| RPC 名 | 入力 | 出力 | 備考 |
|---|---|---|---|
| `ListBooths` | - | booths[] | 来場者向けブース一覧。各ブースの待ち人数・想定待ち時間を含む |
| `GetBooth` | booth_id | booth, waiting_count, estimated_wait_minutes | ブース詳細。来場者の polling に使用 |
| `UpdateBooth` | booth_id, name, description, location, open_at, close_at, experience_type, max_participants_per_ticket, concurrent_capacity, target_party_size, min_party_size, allow_private_match, estimated_minutes_per_person, estimated_minutes_per_session, call_threshold, call_resend_minutes, cooldown_minutes, is_accepting, intro_video_url, survey_url | booth | 全体管理者のみ。R-015 参照 |
| `UpdateBoothMedia` | booth_id, cover_image (bytes) | cover_image_url | カバー画像を R2 にアップロードして URL を返す |
| `UpdateBoothPassword` | booth_id, new_password | - | スタッフ共有パスワードの変更。全体管理者のみ。R-011 参照 |

---

## 3. TicketService

整理券の取得・状態確認・呼び出し・キャンセルを扱う。

| RPC 名 | 入力 | 出力 | 備考 |
|---|---|---|---|
| `CreateTicket` | visitor_id, booth_id, pin, participant_count, ages[], names[], match_mode, parental_consent | ticket_id, sequence_in_booth, status | 整理券発行。PIN 認証・年齢チェック・クールダウンチェックを含む。R-006, R-007, R-005 参照 |
| `GetTicketStatus` | ticket_id | status, rank, estimated_wait_minutes, is_priority_call | 来場者の待ち状況確認。画面 polling で数秒ごとに呼ぶ |
| `ListMyTickets` | visitor_id | tickets[] | マイページの整理券一覧。各 ticket の status・rank を含む |
| `CancelTicket` | ticket_id, pin | - | 来場者によるキャンセル。waiting/called/pending 状態のみ可。R-014 参照 |
| `ListTickets` | booth_id, status_filter | tickets[] | スタッフ向け予約一覧。is_priority_call フラグでソート・強調表示 |
| `CallTicket` | ticket_id | called_at | スタッフによる個別呼び出し。R-008 参照 |
| `CallNextTickets` | booth_id, count | tickets[] | 先頭 N 件をまとめて呼び出す。call_threshold を目安とする。R-008 参照 |
| `IssueTicketByStaff` | visitor_id, booth_id, participant_count, ages[], names[], parental_consent, paper_form_id | ticket_id | スタッフによる特殊フロー手動発行（7〜9 歳対応）。admin.md §6-6 参照 |

---

## 4. AdmissionService

スタッフによる入場処理を扱う。

| RPC 名 | 入力 | 出力 | 備考 |
|---|---|---|---|
| `AdmitByQR` | reception_number, booth_id | outcome, ticket_id, admission_id (nullable) | スキャン結果を outcome で返す。outcome の値域と挙動は下表参照。R-009, R-013 参照 |
| `AdmitByReceptionNumber` | reception_number, booth_id | outcome, ticket_id, admission_id (nullable) | 手動入力による入場処理。QR 読み取り失敗時のフォールバック。outcome 設計は `AdmitByQR` と同じ。R-009 参照 |

### outcome の値域

| outcome 値 | 元の状態 | 遷移後の状態 | admission レコード | スタッフ画面への表示 |
|---|---|---|---|---|
| `admitted` | `called` | `admitted` | 作成される | 「入場処理が完了しました」 |
| `restored_to_priority_call` | `pending` | `called`（`is_priority_call=true`） | 作成されない | 「優先呼び出しに戻しました。次の空きで案内してください」 |
| `already_admitted` | `admitted` | 変化なし | 作成されない | 「既に入場済みです」 |
| `not_found` | 整理券なし | - | 作成されない | 「このブースの整理券が見つかりません」 |
| `waiting_confirmation_needed` | `waiting` | 変化なし（確認待ち） | 作成されない | 「呼び出し前ですが入場処理しますか？」（確認ダイアログ表示） |

> **注意**: `waiting_confirmation_needed` の場合、スタッフが確認ダイアログで承認したら再度 `AdmitByQR`（または `AdmitByReceptionNumber`）を `force=true` フラグ付きで呼ぶ。`force=true` かつ元状態 `waiting` の場合は `admitted` に遷移し、`admission_id` を返す。
>
> `pending → called` の復帰（`restored_to_priority_call`）では admission レコードは作成されない。その後スタッフがブースに空きができたタイミングで改めて QR をスキャンすると `called → admitted` として処理される。

---

## 5. MatchService

matchmaking ブース固有のセッション管理を扱う。

| RPC 名 | 入力 | 出力 | 備考 |
|---|---|---|---|
| `GetMatchQueueStatus` | booth_id | public_waiting_tickets[], private_waiting_tickets[], in_progress_sessions[], total_public_participants | スタッフ向けマッチ待機列の現状取得 |
| `ForceStartMatch` | booth_id | match_session_id, called_tickets[] | 強制開催。min_party_size 以上の場合のみ実行可。R-017 参照 |
| `CallPrivateMatch` | ticket_id | called_at | private モードの整理券を個別に呼び出す |

---

## 6. NotificationService

通知テンプレートの管理と手動再送を扱う。

| RPC 名 | 入力 | 出力 | 備考 |
|---|---|---|---|
| `ListNotificationTemplates` | - | templates[] | 全体管理者向けテンプレート一覧 |
| `UpdateNotificationTemplate` | key, title, body, icon_url | template | テンプレート編集。全体管理者のみ |

---

## 7. RiskExplanationService

保護者同意フローで使用するリスク説明文を管理する。

| RPC 名 | 入力 | 出力 | 備考 |
|---|---|---|---|
| `GetRiskExplanation` | - | body, updated_at | 来場者向け保護者同意フォームで表示する現行のリスク説明文取得 |
| `UpdateRiskExplanation` | body | updated_at | 全体管理者のみ。更新後も過去の consent_text_snapshot には影響しない |

---

## 8. AdminService

スタッフ・全体管理者の認証と管理操作を扱う。

| RPC 名 | 入力 | 出力 | 備考 |
|---|---|---|---|
| `LoginAsStaff` | booth_id, password | session_token | ブース別共有パスワードで認証。R-011 参照 |
| `LoginAsGlobalAdmin` | admin_id, password | session_token | 全体管理者専用ルート |
| `ExportCSV` | export_type | csv_bytes | 来場者・整理券・入場・ブース集計等の CSV 出力。全体管理者のみ |

---

## 9. 仕様外機能（proto 追加前に要確認）

Figma Make に含まれているが仕様書に記載がない機能。
実装前にプロダクトオーナーへ確認すること。

| Service | RPC 名 | 入力 | 出力 | 備考 |
|---|---|---|---|---|
| CheerService | `VoteCarrot` | horse_id, count | total_carrots | 馬レース応援機能（ニンジン投票）。overview.md のスコープに含まれていない |

---

## 10. 設計上の検討事項

### 認証方式

- 来場者: `CreateVisitor` / `AuthenticateVisitor` で得た visitor_id をクライアントが保持（localStorage）
- スタッフ: `LoginAsStaff` で得た session_token を cookie で保持。各 RPC のメタデータに付与
- 全体管理者: `LoginAsGlobalAdmin` で得た session_token を cookie で保持

### ストリーミング vs Unary

- `GetTicketStatus` / `GetBooth`（来場者 polling 用）: 現状は Unary（短い周期で呼ぶ）。将来的に Server-Streaming も検討
- その他はすべて Unary RPC

### pending 自動遷移

- `called_at + call_resend_minutes < now()` の整理券を自動的に pending に遷移するのは**バックグラウンド処理（Go goroutine）**であり、RPC ではない
- pending 遷移時の再通知送信も同様

### CreateTicket の複合性

- Visitor 作成（受付登録）と Ticket 発行（整理券取得）は**別 RPC**に分離する
- Figma Make では一連のフォームに見えるが、ドメイン的には独立した操作（auth.md §6 参照）
- フロントエンド側で順番に呼ぶ: `CreateVisitor` → localStorage 保存 → ブース選択 → `CreateTicket`
