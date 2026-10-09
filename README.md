# EliteMay GitHub Defaults

このRepositoryは、`EliteMay` 所有Repositoryで共通利用するGitHub運用Defaultを管理します。

## 役割

ここで管理するのは、Project横断で共通化できるGitHub上の入口だけです。

- Issue Forms
- Pull Request Template
- Community Health Files
- Reusable WorkflowのCommon Baseline
- GitHub Projectsの中央同期
- 共通運用上の案内

Project固有の仕様・Architecture・Storage Schema・Test Contract・Release Contractは各Project Repositoryを正本とします。


## GitHub全体の入口・担当

同じ情報を複数のRepositoryへコピーせず、知りたい内容に対応する正本を参照します。

| 知りたいこと・やりたいこと | 正本 |
| --- | --- |
| 共通Issue / PR様式、GitHub Actions共通部品 | **この `.github` Repository** |
| Web・Electron開発の共通ルール、判断基準 | [web-project-guide](https://github.com/EliteMay/web-project-guide) |
| 自動検証・開発ループの共通実行コード | [web-project-runtime](https://github.com/EliteMay/web-project-runtime) |
| Web制作の要件定義から実装への引き継ぎ手順 | [web-project-workflow](https://github.com/EliteMay/web-project-workflow) |
| 個別アプリのコード、要件、テスト、リリース | **そのアプリ自身のRepository** |
| AIとの横断タスク・判断・引き継ぎ | [chatgpt-workspace](https://github.com/EliteMay/chatgpt-workspace)（非公開・管理者用） |
| 実行履歴・検証証跡などの非公開作業データ | [web-project-data](https://github.com/EliteMay/web-project-data)（非公開・管理者用） |

各Repositoryの「About」には短い用途説明と検索しやすいTopicsを設定します。READMEには利用方法と正本へのリンクを置き、実行時点の一覧や保留/アーカイブ判断を共通ルールへ固定しません。


## Public Repository Audit（読み取り専用）

[Audit public repositories (read only)](.github/workflows/audit-public-repositories.yml) は、**必要なときだけ手動実行できる監査Workflow**です。

- **使い方:** `Actions → Audit public repositories (read only) → Run workflow`。実行結果はJobの`Summary`に表示します。
- **対象:** `EliteMay`の**公開Repositoryのみ**。Private Repositoryは検出対象から明示的に除外するため、出力を「アカウント全件の監査」とは呼びません。
- **確認内容:** READMEの有無 / Description・Topicsの設定状況 / Default Branchの保護フラグ。実際のRulesetの内容、Actions実行結果、GitHub Pagesの動作までは確認しません。
- **権限:** `GITHUB_TOKEN` + `contents: read`。外部サービス・有料API・追加PATは不要。REST APIはGETのみで、AboutやRuleset、既存Repositoryの設定を変更しません。
- **検証:** [audit-repositories.test.mjs](scripts/audit-repositories.test.mjs) のモックテストを実行してからAPI監査します。監査は不足項目を報告しますが、その存在を理由にCI失敗へはしません。
- **利用上の注意:** レート制限やAPIアクセス失敗時はレポートを未完了としてエラー終了します。機密なPrivate Repositoryを含む診断情報を、このPublic RepositoryのSummary / Artifact / Commitへ出力しません。

実装: [scripts/audit-repositories.mjs](scripts/audit-repositories.mjs)。この監査は`web-project-guide`の共通ルールに従う**現況確認ツール**であり、監査結果をNormative Ruleへコピーしません。

## Reusable Web Baseline

`.github/workflows/reusable-web-baseline.yml` は、複数Web Projectで共通しやすい軽量CIだけを提供します。

- Node.js setup
- JavaScript / MJS syntax check
- JSON parse baseline

Project固有Validator / E2E / Build / Releaseは各Repositoryへ残します。

Callerから利用するときは、中央変更を即時全Projectへ伝播させないため、原則としてこのRepositoryの**確定Commit SHA**へ固定します。

```yaml
jobs:
  baseline:
    uses: EliteMay/.github/.github/workflows/reusable-web-baseline.yml@<commit-sha>
```

Workflow更新は1〜2 ProjectでPilotしてから段階展開します。

## Reusable Electron CI

`.github/workflows/reusable-electron-ci.yml` は、Electron / Node.js製Windowsアプリで共通化しやすいCIだけを提供します。

- Windows runner
- Node.js setup
- npm install
- Unit test
- Windows build
- Actions Artifact upload

Updater成果物の個数確認、Production dependency確認、Release命名規約など、Project固有Contractは各Repository側へ残します。

呼び出し側は中央Workflowの確定Commit SHAへ固定します。

```yaml
jobs:
  electron:
    uses: EliteMay/.github/.github/workflows/reusable-electron-ci.yml@<commit-sha>
    with:
      node-version: "22"
      artifact-name: my-app-windows
      artifact-path: "dist/*"
```

## Reusable JavaScript Security

`.github/workflows/reusable-javascript-security.yml` は、JavaScript / TypeScript系Repository向けの共通Security Baselineです。

- CodeQL
- security-extended queries
- Dependency Review
- Pull RequestでHigh以上の新規脆弱性を検出した場合に失敗

Callerは少なくとも次のPermissionを許可します。

```yaml
permissions:
  actions: read
  contents: read
  security-events: write
```

Dependency ReviewはPull Request時だけ実行します。RepositoryでDependency graphが利用できない場合は自動でスキップし、利用可能になれば同じWorkflowのまま実行されます。CodeQLはPush / Pull Request / Schedule等のCaller eventに従います。

## Dependency Update Baseline

このRepository自身は `.github/dependabot.yml` でGitHub Actionsを週次監視します。

npmを使うElectron Repositoryでは、原則として次を監視します。

- npm dependencies
- GitHub Actions dependencies

Electron系Packageはminor / patchをGroup化し、更新PRが過剰に増えないようにします。

## Release Provenance

ユーザーが実行するWindows Setup.exeを公開するRepositoryでは、Release Workflow内でArtifact Attestationを生成します。

頻繁なCI成果物ではなく、実際に配布するバイナリを対象にします。Project固有のRelease Workflow自体は各Repositoryを正本とします。

## EliteMay Development Project Sync

`.github/workflows/sync-development-project.yml` と `scripts/sync-project.mjs` は、User Project `EliteMay Development`（Project #4）へのIssue登録を中央で自動化します。

### 動作

1時間ごとに `EliteMay` 所有RepositoryのOpen Issueを確認します。

Projectに未登録のIssueだけを追加し、初期値を設定します。

- `Status`: `Todo`
- `Priority`: `P2`
- `Task Type`: Title / Labelから `Bug` / `Improvement` / `Research` / `Maintenance` を判定
- `Needs User Test`: Issue Formの回答を優先し、無い場合はTask Typeから安全側に判定

既にProjectへ登録済みのItemや、人間が設定済みの値は上書きしません。

IssueをCloseした後の`Done`移動はGitHub ProjectsのBuilt-in Workflowへ任せます。

### 認証

GitHub Actionsの通常の`GITHUB_TOKEN`はUser Projectへアクセスできないため、Repository Secret `PROJECT_PAT` を1回だけ登録します。

GitHub公式のUser Project自動化例に合わせ、Personal access token (classic) には次のScopeを付けます。

- `project`
- `repo`

TokenそのものをIssue、README、Workflow、Logへ書かないでください。

Secret登録先:

```text
EliteMay/.github
→ Settings
→ Secrets and variables
→ Actions
→ New repository secret
→ Name: PROJECT_PAT
```

Secret未設定時はWorkflowは安全なno-opとして終了し、Projectを変更しません。

### Manual test

`Actions → Sync EliteMay Development project → Run workflow` から実行できます。

最初は `dry_run = true` で追加予定だけ確認し、問題なければ `dry_run = false` で本登録します。

## Source of Truth

Web / Electron制作の共通判断基準は [`EliteMay/web-project-guide`](https://github.com/EliteMay/web-project-guide) を参照します。

このRepositoryのTemplateは、各Projectに同名のProject固有Templateがない場合のDefaultとして使うことを想定しています。

## 原則

- Project固有仕様をここへ複製しない。
- IssueへAPI Key、Token、Cookie、Password、個人情報、未Sanitizeの診断ログを貼らない。
- PR Templateは確認漏れを減らすために使い、すべての項目を機械的に必須化しない。
- Project固有のIssue / PR Templateが必要な場合は各Repository側を優先する。
- Reusable WorkflowはCommon Baselineだけに留め、Project Contractまで中央化しない。
- Project同期は新規Itemの初期値だけを設定し、人間が後から変更した値を定期同期で上書きしない。
