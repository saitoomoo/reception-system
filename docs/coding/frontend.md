# Frontend Coding Conventions

Next.js (App Router) + TypeScript + shadcn/ui のフロントエンド開発における規約をまとめたものです。

---

## 1. ディレクトリ配置ルール

### 規模に関わらず固定の配置

| パス | 用途 |
|---|---|
| `components/ui/` | shadcn/ui 等のプリミティブコンポーネント |
| `components/layout/` | ヘッダー・フッター・サイドバー等のグローバルレイアウト |
| `lib/` | 汎用的な関数(日付フォーマット、文字列操作等) |
| `hooks/` | アプリ全体で使うフック |

### ドメイン機能の配置(規模で変わる)

プロジェクト規模に応じて以下から選択する。

| 規模 | 構成 |
|---|---|
| 画面10個未満、機能の境界が曖昧 | `app/.../_components/` のみ(features/ は作らない) |
| 画面10〜30個、明確な機能境界がある | ハイブリッド(features/ + Colocation) |
| 画面30個以上、複数チーム | ハイブリッドを厳格に運用 |

#### ハイブリッド構成の標準形

```
app/
  layout.tsx
  page.tsx                    # ルート画面
  (auth)/
    login/
      page.tsx
      _components/            # この画面でしか使わない UI
  users/
    [id]/
      page.tsx
      _components/            # この画面でしか使わない UI
      _hooks/                 # この画面でしか使わない hooks

features/
  user/
    components/               # 複数画面で使う user 関連 UI
    hooks/                    # user 関連の状態・ロジック hooks
    api.ts                    # user 関連の API 呼び出し
    types.ts                  # user 関連のドメイン型
  order/
    ...

components/
  ui/                         # 機能横断の汎用 UI(shadcn/ui 由来含む)
  layout/                     # グローバルレイアウト

lib/
  connect/                    # Connect-RPC クライアント設定
  utils/                      # 純粋なユーティリティ関数

hooks/                        # 機能横断の汎用 hooks(useDebounce 等)
```

### 配置の判断ルール

1. **その画面でしか使わない** → `app/.../_components/` または `_hooks/`
2. **特定機能(user, order 等)に紐づき、複数画面で使う** → `features/<機能名>/`
3. **機能を問わず使える汎用 UI** → `components/ui/`
4. **機能を問わず使える純粋なロジック** → `lib/`

### 成長に応じた昇格ルール

- 最初は `app/<route>/_components/` に置く
- **3回目の利用が発生したタイミング**で `features/<feature>/components/` または `components/ui/` に昇格させる
- 例外: 変更困難な領域(認証フォーム、決済UI等)は2回目で昇格を検討する

> 下から上には移動しやすいが、上から下には移動しにくい。だから迷ったら下(より局所的な場所)から始める。

---

## 2. Server Component / Client Component の使い分け

### 原則: デフォルトは Server Component

- `'use client'` は必要な場合のみ明示的に付ける
- 「迷ったら Server Component」を出発点にする

### Client Component にする条件(いずれかに該当)

1. ユーザー操作のハンドリングが必要(onClick, onChange, onSubmit 等)
2. React hooks(useState, useEffect, useReducer, カスタムフック)を使う
3. ブラウザ API(localStorage, window, document)を使う
4. TanStack Query / React Hook Form / Zustand 等のクライアント用ライブラリを使う

### 境界の引き方

- Client Component は **インタラクティブな葉** に閉じる
- ページ自体(page.tsx)は Server Component に保つ
- インタラクティブな部分だけ Client Component に切り出して埋め込む
- 例: 一覧ページの page.tsx は Server Component、検索フォームだけ Client Component

### 初期データ取得の戦略

| ページの性質 | 戦略 |
|---|---|
| 公開ページ(SEO 必要、ログイン不要) | Server Component で Connect クライアントを直接呼ぶ → Client Component に props で渡す |
| 認証後ページ(SEO 不要) | Client Component から TanStack Query で取得 |
| 中間(認証後だが SEO も気にする) | Server Component で初期取得 + Client Component の TanStack Query に initialData として渡す |

### Server Component での API 呼び出し

- Connect クライアントを直接生成して呼ぶ
- 認証情報は cookie / header から読み取って付与する
- エラーは Next.js の error.tsx に委ねる(try/catch で握り潰さない)

---

## 3. 状態管理

### 判断ルール

新しく状態を扱う必要が出たら、以下の順で判断する。

1. **その状態は API から取得するものか？**
   → Yes: TanStack Query + connect-query を使う
   → No: 次へ

2. **その状態はフォーム入力か？**
   → Yes: React Hook Form + Zod を使う
   → No: 次へ

3. **その状態は1つのコンポーネント内で完結するか？**
   → Yes: useState / useReducer を使う
   → No: 次へ

4. **その状態は静的または変更頻度が低いか？(テーマ、認証情報、ロケール等)**
   → Yes: React Context を使う
   → No: Zustand を使う

### 補足

- React Hook Form のバリデーションスキーマ(Zod)は、Connect-RPC の生成型と整合させる
- TanStack Query のキャッシュキーは connect-query の規約に従う(自前で文字列を組まない)
- Zustand のストアは機能ごとに分割する(`useUserStore`, `useCartStore` のように)

---

## 4. エラーハンドリング

### 標準的な扱い

- エラーは throw する。Result 型は使わない
- 致命的エラー(API 通信失敗、想定外の例外)は **Error Boundary** で捕捉する
- 各画面の `app/<route>/error.tsx` で画面単位のエラー UI を定義する
- ルート全体のフォールバックは `app/error.tsx`

### TanStack Query のエラー

- `error` state を見て UI で if 分岐する(throw しない)
- 致命的エラーだけ `throwOnError: true` を設定して Error Boundary に流す

### React Hook Form のエラー

- `formState.errors` をフィールド単位で表示
- スキーマバリデーション(Zod)で検出されたエラーはここで表現

### Connect クライアントのエラー

- `ConnectError` は throw されるので、TanStack Query の error として自動的に扱える
- `error.code` を見て UI 出し分けできる(NotFound なら 404 表示など)

### やってはいけないこと

- try/catch でエラーを握り潰してデフォルト値を返す(堅牢さに反する)
- エラーを console.error だけしてユーザーに何も表示しない

---

## 5. 型ポリシー(TypeScript)

### tsconfig

- `strict: true` を有効にする(個別オプションは無効化しない)
- 以下が ON になる:
  noImplicitAny, strictNullChecks, strictFunctionTypes, strictBindCallApply,
  strictPropertyInitialization, alwaysStrict, noImplicitThis, useUnknownInCatchVariables

### any / unknown / as の使い方

- **`any` は使用禁止**(ESLint で `@typescript-eslint/no-explicit-any` を error 設定)
- 型が確定できない値は `unknown` で受け、型ガードで絞り込む
- `as` キャストは最小限。やむを得ず使う場合:
  - DOM 型(`document.querySelector` の戻り値等)はまず `as` でキャストしてよい
  - それ以外の `as` には **理由をコメントで併記する**
  - `unknown` から特定型への変換は、可能なら型ガード関数を書く

### 型定義の置き場所

- 機能固有の型: `features/<feature>/types.ts`
- 機能横断の型: `lib/types/`
- Connect-RPC 由来の型: `gen/`(生成物。手動編集禁止)

---

## 6. 命名規則

- **ファイル名**: kebab-case (`user-profile.tsx`)
- **React Component**: PascalCase (`UserProfile`)
- **Hooks**: `use` プレフィックス (`useDebounce`)
- **変数・関数**: camelCase
- **型・インターフェース**: PascalCase
- **定数(モジュールトップレベルの真の定数)**: UPPER_SNAKE_CASE
- **Boolean 変数**: `is`, `has`, `can`, `should` プレフィックスを推奨
- **略語は最小限**(`usr` ではなく `user`、`btn` ではなく `button`)
- **否定形の Boolean は避ける**(`isNotLoading` より `isLoading`)

---

## 7. テスト方針

### テスト対象とする

- カスタムフック(useAuth, useDebounce 等のロジックを含むもの)
- 純粋な関数(フォーマッター、バリデーター、計算処理等)

### テスト対象としない

- 表示のみのコンポーネント(shadcn/ui ラッパー、Figma Make 由来の UI)
- props を受け取って描画するだけのコンポーネント
- `app/<route>/page.tsx`(E2E でカバー)

### E2E テスト

- ツールは **Playwright** を使う
- 5〜10 シナリオに絞る:
  - 認証フロー(登録 → ログイン → ログアウト)
  - 主要機能の CRUD 動線
  - 認証ガードの動作確認
- バリデーションエラーやエッジケースは Integration テストでカバーする
- E2E は「主要動線が完全に壊れていないこと」だけを保証する

---

## 8. Figma Make フローの統合

### 取り込み手順

1. Figma Make が生成した `App.tsx` を読み込む
2. 各画面ごとに `app/<route>/page.tsx` に分離
3. その画面でしか使わない子コンポーネントは `app/<route>/_components/` へ
4. 既に存在する汎用 UI(Button 等)と重複するものは `components/ui/` の既存実装に置き換える
5. 重複していなくても、複数画面で使う想定のものは `components/ui/` に切り出す

### 注意点

- Figma Make 由来のコードはそのままだとデフォルトで Client Component 扱いになっている可能性が高い
- 取り込み時に Server / Client Component の判断ルールに照らして見直す
- 取り込み後、テスト対象外の表示コンポーネントはテストを書かない
