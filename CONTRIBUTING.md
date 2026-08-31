# Contributing

このファイルは`EliteMay`所有Repositoryの共通Contribution Defaultです。各Projectに固有ルールがある場合は、そのRepository側のREADME / Spec / PROJECT_RULES / CONTRIBUTINGを優先します。

## 変更前

1. 現在のRepository状態を確認する。
2. README / Spec / Project Rules / `PROJECT_LEARNINGS.md` / `AGENTS.md`がある場合は必要範囲を読む。
3. 保存互換性、GitHub Pages、Electron Release、外部Service等への影響を確認する。
4. 変更規模に合う経路を選ぶ。
   - 小規模で明確な変更: 最小差分を優先
   - 複数機能・高リスク変更: Branch / Pull Requestを優先

## Pull Request

PRには最低限、次を残します。

- 変更理由
- 変更範囲
- 保存 / URL / Release等のCompatibility
- 実行したValidation
- 未確認事項
- 必要なUser Test

AIが生成したCodeも、既存仕様とProject固有Validationを通してから完成扱いにします。

## Validation

Project固有のTest / Build / E2E / Release Checkを優先してください。

共通Reusable Workflowがある場合も、Project固有Validatorを置き換えるものではありません。

## Security

Secret、Token、Cookie、Password、Private Key、個人情報、未SanitizeのDiagnostic LogをCommit / Issue / Pull Requestへ含めないでください。

## Common guide

Web / Electron制作の共通判断基準は [`EliteMay/web-project-guide`](https://github.com/EliteMay/web-project-guide) を参照します。
