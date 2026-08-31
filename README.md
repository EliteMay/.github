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
