# Security Policy

このファイルは`EliteMay`所有Repositoryの共通Security Defaultです。Project固有のSecurity Policyがある場合はそちらを優先します。

## 公開Issueへ書かないもの

以下を公開Issue / Pull Request / Discussionへ貼らないでください。

- API Key / Access Token / Refresh Token
- Cookie / Authorization Header
- Password / Private Key
- `.env`等の秘密設定
- 個人情報
- 未SanitizeのDiagnostic Log全文
- 非公開Media / File body

## Vulnerability report

RepositoryでGitHub Private Vulnerability Reporting等の非公開報告手段が有効な場合は、それを優先してください。

非公開報告手段が見つからない場合、公開Issueへ攻撃手順・Secret・Sensitive Dataを貼らず、詳細を伏せた最小限のIssueで「Security issueの非公開連絡手段が必要」と伝えてください。

## Project-specific security

Authentication、Supabase / API、Electron IPC、Update Provider、Storage、Secret管理等のProject固有ルールは各RepositoryのREADME / Spec / PROJECT_RULES / Security設定を正本とします。

共通制作判断は [`EliteMay/web-project-guide`](https://github.com/EliteMay/web-project-guide) のSecurity章を参照します。
