# [bairmair]

@docs/PROJECT_BRIEF.md
@docs/PROGRESS.md

## Working rules
- Work on one build step at a time; stop and summarize when a step is done.
- At the end of each step, update docs/PROGRESS.md: what's done, decisions made, what's next. Keep it short.
- Use pnpm, not npm or yarn.
- Never commit secrets; local keys live in gitignored .env files.
- I test the iOS scanner on a physical device myself. Tell me exactly what to run and what to check.

## Apps in this monorepo
- `apps/web` and `apps/mobile`: the marketplace (brief and progress above).
- `apps/scan` (planned): bairmair scan, a standalone scanning app with a paid subscription. Read `docs/scan/PLAN.md` before working on it; its progress goes to `docs/scan/PROGRESS.md`, not `docs/PROGRESS.md`.