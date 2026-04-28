# LLM API Bench

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review

## Screenshot Rules

- All screenshots in `docs/screenshots/` must be **1100×720** pixels
- Use puppeteer with `defaultViewport: { width: 1100, height: 720 }`
- **Demo Mode is for screenshots/GIF only** — do NOT leave it on during normal development.
- To enable: create `frontend/.env.local` with `VITE_DEMO_MODE=true`, then start/restart the dev server. To disable: delete the file and restart.
  ```bash
  # Enable (before screenshots/recording)
  echo "VITE_DEMO_MODE=true" > frontend/.env.local
  cd frontend && npm run dev

  # Disable (after screenshots/recording)
  rm frontend/.env.local
  # restart dev server
  ```
- `record-demo.sh --dev` starts its own Vite server — it reads `frontend/.env.local` automatically. When using `--skip-server`, ensure the external Vite server has demo mode enabled.
- Demo Mode rewrites display values at the React hook level (no DB writes). Mapping: id-stable `ProviderA/B/C…`, `https://api.provider-a.example.com/v1`, `sk-****`. Implementation: `frontend/src/utils/demo.ts`.
- **Do NOT commit** `frontend/.env.local` — it is in `.gitignore`.

## GitHub Rules

- Do NOT use the `gh` CLI to search GitHub content. Use web search tools instead.

## Testing Rules

- Login credentials are in `.env` (AUTH_USERNAME / AUTH_PASSWORD)
- For browser testing, set `export CI=true` before using browse/gstack tools (root environment needs --no-sandbox)

### Regression Test Flow

Run in order before releases or after major changes:

1. **Unit tests** (4s): `cd frontend && npm test && cd ../backend && npm test`
2. **Type check** (seconds): `cd frontend && npx tsc --noEmit && cd ../backend && npx tsc --noEmit`
3. **E2E QA** (5-10 min): `/qa` against localhost — follow `docs/qa/e2e-checklist.md` (43 cases)

Baseline (v2.11.0): 148 tests (frontend 56, backend 92), Health Score 9.30/10.

### Test Conventions

- Every QA-discovered bug must get a corresponding unit test before closing
- Regression tests for HTML structure issues use DOM assertions (e.g., no nested buttons)
- Regression tests for antd API changes use source file structural checks
- QA reports are stored in `.gstack/qa-reports/` (not committed)

## Language Rules

- All code, scripts, comments, commit messages, and documentation must be written in **English**, unless explicitly requested otherwise by the user.
- Design docs, PRDs, and plans live in `design/` directory.

## CHANGELOG Rules

- Follow [Keep a Changelog](https://keepachangelog.com/) format
- Use real dates and version numbers only — never fabricate past entries
- Group changes under: `Added`, `Changed`, `Fixed`, `Removed`, `Deprecated`, `Security`
- Use `[Unreleased]` for changes not yet tagged/released; move to a versioned section on release
- Each entry should be a concise, user-facing description of the change (not internal implementation details)
- Reference actual git history (`git log`) to verify dates and scope — do not guess
- Keep entries in reverse chronological order (newest first)
