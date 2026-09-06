# Study workspace

공부한 내용, 재현 코드, 실험 결과와 분석을 주제별 폴더에 기록하는 workspace입니다.

- 이 규칙과 아래 RV Workflow 지침은 모든 하위 학습 폴더에 적용합니다. 하위 폴더에 `AGENTS.md`가 있으면 해당 범위의 구체적인 규칙을 우선합니다.
- 각 학습 폴더의 README와 runtime pin을 먼저 확인합니다. 루트에 공통 런타임이나 package manager를 강제하지 않습니다.
- 기존 실험 결과, 로그, 스냅샷과 사용자 변경을 보존합니다. 재실행 결과는 해당 폴더의 지침에 따라 별도 위치에 저장합니다.
- 학습 자료를 추가하면 루트 README의 학습 목록을 갱신하고, 실행 방법과 상세 분석은 해당 폴더의 문서에서 관리합니다.

## RV Workflow plugin

This fragment is opt-in. Apply it only after reviewing the dry-run report for this project; it never replaces an existing `AGENTS.md`.

Use the smallest plugin-qualified role skill that covers the task: `$rv-workflow:backend`, `$rv-workflow:frontend`, `$rv-workflow:document`, `$rv-workflow:qa`, or `$rv-workflow:planner`. Use `$rv-workflow:project-toolchain` before executable work and its no-op path for prose-only work.

At the start of every tool-using agent task, including read-only inspection, status checks, and small tasks, invoke `$rv-workflow:task-progress` only long enough to resolve its installed plugin root, then run `npm --prefix <plugin-root> run progress:ensure -- --color --workspace <project-root>` exactly once before any role or task classification. This startup is independent of task tracking: it reuses a live watcher and opens a panel only when one is absent. An ensured watcher exits after the workspace has remained on completed work for 30 seconds. If a tracked task is created after the initial startup call, run the same `progress:ensure` command once immediately after creation so slow classification cannot leave that task without a panel. Do not pass `--task-id`. Pure conversational responses that require no tools do not launch the panel.

For explicitly tracked or medium/large work, use `$rv-workflow:task-progress` only at phase boundaries (task/step creation, step start, major milestone, block, completion or skip). Small questions, status checks, file lookups, localized routine edits, and routine commits remain untracked even though the shared panel startup runs. The inline MCP dashboard is read-only; write progress explicitly through the MCP tools. The terminal companion may apply only its confirmed, allowlisted step commands through the same task service. Repeat `--ensure-panel` once just after tracked task creation, but not at later milestones.

Before sending a final response for tracked work, the coordinating agent must read the latest task snapshot. It must not leave a runnable step `pending` or `in_progress`: start and complete the step with evidence, or skip it with a concrete reason when it is genuinely unnecessary. Never infer step completion from an agent or terminal disappearing. Render the dashboard once the task is completed or blocked so the final recorded state is visible.

Use `$rv-workflow:scoped-superpowers` only for medium, large, or high-risk work or an explicitly requested bundled workflow. Preserve its explicit-only allow-list and load at most one phase-specific bundled reference. Keep `test-writer` separate from production implementation.
