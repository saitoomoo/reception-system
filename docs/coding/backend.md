# Backend Coding Conventions

Go + `net/http` + Connect-RPC + sqlc + pgx + PostgreSQL のバックエンド開発における規約をまとめたものです。

---

## 1. ディレクトリ構成

### 構成の判定ルール

以下の全条件を満たす見込みなら **B(機能別)** で始める:

- エンドポイント数 ≦ 20
- 開発者数 ≦ 3 人
- コードベース ≦ 1万行
- 保守期間 ≦ 2 年
- ドメインが単純

1つでも超える可能性があれば **C(ハイブリッド)** で始める。
B から C への移行コストは高いため、**迷ったら C** を選ぶ。

### B: 機能別構成

```
cmd/server/main.go
internal/
  feature/
    user/
      handler.go
      repository.go
      service.go        # 必要時のみ(後述)
    order/
      handler.go
      repository.go
gen/                    # proto から生成(手動編集禁止)
```

### C: ハイブリッド構成

```
cmd/server/main.go
internal/
  feature/
    user/
      handler.go
      repository.go
      service.go        # 必要時のみ
    order/
      ...
  pkg/
    auth/               # 認証ミドルウェア
    middleware/         # 共通ミドルウェア
    db/                 # DB 接続・トランザクション管理
    connecterr/         # Connect エラー変換
gen/
```

---

## 2. 層構成と依存方向

### 基本は2層構成

```
internal/feature/<機能>/
  handler.go      # Connect ハンドラ。バリデーション、ロジック、repository 呼び出し
  repository.go   # DB アクセス(sqlc 生成物のラッパー)
```

### 以下のいずれかに該当したら3層化(service.go を追加)

1. 複数の repository をまたぐビジネスロジックがある
2. 同じロジックを複数のハンドラから呼ぶ必要が出た
3. 外部 API 呼び出しと DB 更新を組み合わせる必要がある
4. トランザクション境界がハンドラの単位と一致しない

### 依存方向の原則

- handler は service と repository を呼べる
- service は repository を呼べるが、handler は呼べない
- repository は他の何も呼ばない(DB アクセスに専念)
- domain(型定義のみのファイル)は他の何も import しない

---

## 3. Connect-RPC 規約

### スキーマ定義

- `proto/<service>/<version>/<service>.proto` に定義
- `buf.yaml` / `buf.gen.yaml` でビルド
- 生成物は `gen/go/` と `gen/ts/` に出力
- **生成物は手動編集禁止**

### ハンドラの実装

- `connectrpc.com/connect` を使う
- ハンドラは `internal/feature/<機能>/handler.go` に配置
- リクエスト → ドメインモデル変換、レスポンス ← ドメインモデル変換は handler で行う
- ストリーミングが必要な場合は Connect の Server-Streaming / Client-Streaming / Bidi-Streaming を使う(Server-Sent Events や WebSocket より優先)

---

## 4. エラーハンドリング(Go)

### 基本: errors パッケージで wrap

- エラーを呼び出し元に返すときは `fmt.Errorf("<context>: %w", err)` でラップする
- ラップ時の context 文字列は "関数名やリソース名" を含める
  - 例: `fmt.Errorf("user repository: get by id: %w", err)`
- スタックトレースは持たないが、エラーチェーンで原因が辿れる

### ドメイン固有のエラーはカスタム型

- "業務上意味のあるエラー" は型として定義する
  - 例: `ErrUserNotFound`, `ErrEmailAlreadyTaken`, `ErrUnauthorized`
- カスタム型は `errors.Is` / `errors.As` で判別できるようにする
- パッケージ単位で `errors.go` ファイルを作り、定数または型を集約する

### sentinel エラーの定義

- 単純な「種類だけ識別できればいい」エラーは sentinel value を使う
  - `var ErrNotFound = errors.New("not found")`
- フィールドを持たせたいときはカスタム型を使う

### やってはいけないこと

- エラーを文字列比較で判別する(`if err.Error() == "..."`)
- エラーを握り潰す(`_ = doSomething()`)
- 同じエラーを2回ラップする

---

## 5. Connect エラー変換

### 変換は Connect ハンドラの境界で一括して行う

- repository / service は **Go 標準のエラーのみ** を返す(Connect を知らない)
- handler が `errors.As` でカスタム型を判別し、Connect エラーコードに変換する

### 変換テーブル(最低限)

| Go 側のエラー | Connect コード |
|---|---|
| `ErrNotFound`, `*NotFoundError` | `connect.CodeNotFound` |
| バリデーションエラー(Zod-like) | `connect.CodeInvalidArgument` |
| `ErrUnauthorized` | `connect.CodeUnauthenticated` |
| `ErrForbidden` | `connect.CodePermissionDenied` |
| `context.DeadlineExceeded` | `connect.CodeDeadlineExceeded` |
| その他(予期しないエラー) | `connect.CodeInternal` |

### 変換関数は機能横断で1つ用意する

- `internal/pkg/connecterr/convert.go` などに集約
- 各ハンドラはこの関数を呼ぶだけ

---

## 6. DB アクセス(sqlc + pgx)

### 基本方針

- **SQL を直接書く**(`queries/` ディレクトリ等に配置)
- `sqlc` で型安全な Go コードを生成
- 生成されたコードは `gen/` または `internal/sqlc/` 等に配置(手動編集禁止)
- repository.go では sqlc 生成型をドメイン型に変換して返す

### ロジックの SQL 流出を防ぐ

- ビジネスロジックを SQL に埋め込まない(集計や条件分岐はアプリ側で)
- ただし、パフォーマンス上 SQL でやるべき場合(JOIN、集計関数、ウィンドウ関数等)は SQL で行う
- 判断基準: そのロジックが「データの取得方法」なら SQL、「業務上の意味」ならアプリ側

### トランザクション

- pgx の `Tx` を使う
- トランザクション境界は handler または service が決める(repository は決めない)
- 複数 repository をまたぐトランザクションは service 層を必要とする(=3層化の条件)

---

## 7. ロギング(slog)

- `log/slog` を使う(標準ライブラリ)
- ハンドラは環境変数で切り替える:
  - `APP_ENV=production` → JSONHandler
  - それ以外 → TextHandler
- ロガーは依存注入する(グローバル変数で global logger を使わない)
  - service / handler に `*slog.Logger` をフィールドで持たせる

### 構造化ログの書き方

```go
logger.Info("user created",
    slog.String("user_id", user.ID),
    slog.String("request_id", reqID),
)

logger.Error("failed to create user",
    slog.Any("error", err),
    slog.String("request_id", reqID),
)
```

### 出すべき項目

- リクエストごとに **リクエスト ID** をミドルウェアで生成し、すべての関連ログに付与する
- エラー発生時はエラーチェーン全体を構造化して出す

詳細な PII の扱いは @docs/coding/shared.md を参照。

---

## 8. 命名規則(Go)

- `Effective Go` および Google Go Style Guide に従う
- ファイル名: snake_case
- 公開シンボル: PascalCase / 非公開: camelCase
- パッケージ名: 短い小文字単語(複数語は避ける)
- インターフェース名: 末尾に `er` を付ける慣習(`Reader`, `UserFinder` 等)。ただし用途が明確なら無理にしない

---

## 9. テスト方針

### Integration テストが中心

- handler から repository、実 PostgreSQL まで通すテスト
- testcontainers-go で本物の PostgreSQL を起動する
- モックや SQLite 代用は使わない(PostgreSQL 固有機能の挙動が違うため)
- 各テストは独立したスキーマまたはトランザクションロールバックで分離する

### Unit テストの対象

- 純粋なロジック関数(バリデーション、計算、変換等)
- sqlc 生成コードの Unit テストは不要(生成物のため)

### 何をテストすべきか

- すべてのハンドラに対して happy path の Integration テスト 1 本
- すべてのハンドラに対してエラーケースの Integration テスト 1 本以上
- ビジネスロジックを含む関数の Unit テスト

### テストを書くタイミング

- **重要箇所は TDD(テストファースト)**:
  - 認証・認可
  - 決済・課金処理
  - データ整合性が重要な処理(トランザクション、ロック等)
  - 過去に1度でもバグった箇所
  - 複雑なビジネスロジック
- **それ以外はテストアフター**:
  - 単純な CRUD
  - 表示・整形ロジック
  - 既存パターンの単純な拡張

---

## 10. やってはいけないこと(Go 固有)

- ジェネリクスを過剰に使う(具象型で十分なのに型パラメータを増やす)
- 巨大な init() を書く(依存解決は明示的に)
- グローバル変数を増やす(設定はコンストラクタ経由で渡す)
- panic を業務ロジックで使う(エラーは err として返す)
- goroutine を leak させる(必ず ctx で制御し、終了を保証)
- 戻り値を `_` で捨てる(エラーは必ず処理する)
