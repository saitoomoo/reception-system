# CLI Coding Conventions

Go で CLI ツール・データ処理ツールを作るときの規約をまとめたものです。バックエンド規約(`@docs/coding/backend.md`)からエラーハンドリング・ロギング・命名規則を継承します。

---

## 1. CLI フレームワーク

### 基本: 標準 `flag` パッケージを使う

- 依存ゼロ、標準ライブラリのみで完結する
- 単一コマンドや単純な引数解析には十分
- `flag` の使い方は `Effective Go` の例に従う

### 例外: サブコマンドが必要になったら `urfave/cli`

- `tool subcommand --opt` のようなサブコマンド構造が必要になったら導入する
- 例: `mytool migrate up`, `mytool seed users`
- cobra は採用しない(規約をシンプルに保つため)

### 移行のタイミング

- サブコマンドが2つ以上必要になった時点で `urfave/cli` への移行を検討する
- 1つのみであれば `flag` で書ける

---

## 2. 設定の扱い

### 基本: `.env` ファイル + 環境変数

- 開発時は `.env` を読み込む(`godotenv` 等)
- 本番は環境変数を直接渡す(コンテナ環境では `docker run -e`、CI では secrets)
- `.env` は `.gitignore` に必ず含める。`.env.example` をリポジトリに置いて期待される変数を明示する

### 環境変数の命名

- すべて `UPPER_SNAKE_CASE`
- ツール名のプレフィックスを付ける(`MYTOOL_DB_URL`, `MYTOOL_LOG_LEVEL` 等)
- 機密情報は `_TOKEN`, `_SECRET`, `_PASSWORD` 等のサフィックスで識別可能にする

### 設定値の検証

- 起動時にすべての必須環境変数が揃っているかチェックする
- 不足していたら **stderr に分かりやすいメッセージを出して exit 1** で終了する
- 「途中で動かして失敗する」より「起動時に明示的に失敗する」を優先

### 例外: 階層構造が必要な複雑な設定

- データ処理パイプラインの設定など、階層構造が本質的に必要な場合のみ TOML / YAML を使う
- その場合も、認証情報は環境変数から取り、設定ファイルにはハードコードしない

---

## 3. 標準入出力の規約(Unix Philosophy)

### 出力先の使い分け

- **stdout**: データ。次のコマンドにパイプで渡せるもの
- **stderr**: ログ・診断情報・エラーメッセージ
- **stdin**: 入力データ(ファイル指定がない場合のデフォルト入力)

### 具体例

データ変換ツールの例:
```bash
mytool transform input.csv > output.csv
mytool transform < input.csv > output.csv
cat input.csv | mytool transform | grep ...
```

このとき:
- 変換結果は **stdout** に書く
- 進捗・エラー・ログは **stderr** に書く
- これで `output.csv` にログが混ざらず、`grep` も正しく動作する

### やってはいけないこと

- データとログを混ぜて stdout に書く(パイプが壊れる)
- エラーメッセージを stdout に書く(終了コードと整合しない)
- 進捗バーを stdout に書く(自動化スクリプトでデータが汚染される)

### Go での書き方

```go
fmt.Fprintln(os.Stdout, "data line")              // データ
fmt.Fprintln(os.Stderr, "ERROR: ...")             // エラー
slog.Info("processing", slog.String("file", f))   // ログ(slog はデフォルトで stderr)
```

### slog のハンドラ設定(CLI 用)

- 出力先は明示的に `os.Stderr` を指定する:
  ```go
  handler := slog.NewTextHandler(os.Stderr, nil)
  ```
- バックエンドのサーバーと違い、CLI は stdout を「データ専用」にしたいため、デフォルト設定に頼らず明示する

---

## 4. 終了コード

### 基本: 0 / 1 のみ

- `0` = 成功
- `1` = 失敗
- 失敗の詳細は **stderr に書く**(終了コードでは表現しない)

### 拡張のタイミング

以下のいずれかが必要になったら細分化を検討:

- 自動化スクリプトから呼び出して、失敗の種類で制御フローを分けたい
- 監視システムから種類別にアラートを出したい

その時点で以下に移行する:
- `0` = 成功
- `1` = 入力エラー(引数・設定が不正)
- `2` = 実行エラー(処理中の失敗)
- `3` = 外部依存エラー(DB 接続失敗、API 不到達等)

### Go での書き方

```go
if err != nil {
    fmt.Fprintf(os.Stderr, "ERROR: %v\n", err)
    os.Exit(1)
}
```

### `panic` は使わない

- 業務ロジックの失敗は `os.Exit` または `log.Fatal` で終わらせる
- panic はプログラマのミス(配列範囲外等)を表すために予約する
- ライブラリでは panic を使わず、エラーを返して呼び出し元に判断させる

---

## 5. ディレクトリ構成

### 単一 CLI のみ

```
cmd/mytool/main.go      # エントリポイント
internal/
  app/                  # CLI のビジネスロジック
  config/               # 設定読み込み
go.mod
.env.example
```

### 複数 CLI(同一リポジトリで管理)

```
cmd/
  tool1/main.go
  tool2/main.go
internal/
  shared/               # 複数 CLI で共有するロジック
  tool1/                # tool1 固有のロジック
  tool2/                # tool2 固有のロジック
go.mod
```

### バックエンドサーバーと CLI が同居する場合

```
cmd/
  server/main.go        # Web サーバー
  migrate/main.go       # マイグレーションツール
  seed/main.go          # シードデータ投入
internal/
  feature/...           # サーバー側の機能
  pkg/...               # 共通基盤
  cli/...               # CLI 固有のロジック
```

---

## 6. ログのフォーマット(CLI 固有)

### 開発時(対話的に実行)

- text フォーマット(slog の TextHandler)
- 環境変数 `LOG_LEVEL=debug` で詳細出力

### バッチ実行・自動化時

- JSON フォーマット(slog の JSONHandler)
- ログ収集システムに食わせる前提
- 環境変数 `LOG_FORMAT=json` で切り替え

### 切り替えロジック

```go
var handler slog.Handler
if os.Getenv("LOG_FORMAT") == "json" {
    handler = slog.NewJSONHandler(os.Stderr, nil)
} else {
    handler = slog.NewTextHandler(os.Stderr, nil)
}
logger := slog.New(handler)
```

---

## 7. データ処理ツール固有の規約

### 入力ファイルの扱い

- 引数にファイルパスがあればそれを読む
- 引数がなければ stdin から読む
- これにより `mytool transform file.csv` も `cat file.csv | mytool transform` も動く

### 出力ファイルの扱い

- 引数で出力先を指定しない場合は stdout に書く
- 引数で `-o output.csv` のように指定された場合はそのファイルに書く

### バッチ処理の進捗表示

- stderr に進捗を出す
- TTY かどうかを判定して、TTY なら `\r` で行を上書き、非 TTY なら定期的に新行で出す
- 例: `[100/1000] processing user records...`

### 大量データの扱い

- ストリーミング処理を基本とする(全部メモリに乗せない)
- CSV / JSON Lines 等、行単位で処理可能な形式を選ぶ
- Go では `bufio.Scanner` または `encoding/csv` の Reader で行単位読み込み

---

## 8. テスト方針(CLI 固有)

- メインのビジネスロジックは関数として切り出し、Unit テストを書く
- `main` 関数自体はほぼテストしない(引数解析と関数呼び出しだけにする)
- 標準入出力をテストするときは `bytes.Buffer` を `io.Writer` / `io.Reader` として渡せる構造にする
- `os.Exit` を直接呼ばず、エラーを返して main で exit する設計にする(テスト可能性が上がる)

```go
// テストしにくい
func main() {
    if err := run(); err != nil {
        log.Fatal(err)
    }
}

// テストしやすい
func main() {
    if err := run(os.Args[1:], os.Stdin, os.Stdout, os.Stderr); err != nil {
        fmt.Fprintf(os.Stderr, "ERROR: %v\n", err)
        os.Exit(1)
    }
}

func run(args []string, stdin io.Reader, stdout, stderr io.Writer) error {
    // 本体ロジック
}
```

---

## 9. やってはいけないこと(CLI 固有)

- データとログを stdout に混ぜる
- エラーメッセージを stdout に書く
- 進捗バーを stdout に書く
- 設定ファイルにパスワード・トークンをハードコードする
- 起動時に必須設定をチェックせず、途中で初めて失敗する
- panic で業務エラーを表現する
- `flag` で済む規模なのに cobra を入れる
- main 関数に大量のロジックを書く(テストできない)
