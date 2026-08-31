# EliteMay GitHub Defaults

このRepositoryは、`EliteMay` 所有Repositoryで共通利用するGitHub運用Defaultを管理します。

## 役割

ここで管理するのは、Project横断で共通化できるGitHub上の入口だけです。

- Issue Forms
- Pull Request Template
- Community Health Files
- Reusable WorkflowのCommon Baseline
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

## Source of Truth

Web / Electron制作の共通判断基準は [`EliteMay/web-project-guide`](https://github.com/EliteMay/web-project-guide) を参照します。

このRepositoryのTemplateは、各Projectに同名のProject固有Templateがない場合のDefaultとして使うことを想定しています。

## 原則

- Project固有仕様をここへ複製しない。
- IssueへAPI Key、Token、Cookie、Password、個人情報、未Sanitizeの診断ログを貼らない。
- PR Templateは確認漏れを減らすために使い、すべての項目を機械的に必須化しない。
- Project固有のIssue / PR Templateが必要な場合は各Repository側を優先する。
- Reusable WorkflowはCommon Baselineだけに留め、Project Contractまで中央化しない。
