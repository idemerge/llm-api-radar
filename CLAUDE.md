# LLM API Radar

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

## GitHub Rules

- Do NOT use the `gh` CLI to search GitHub content. Use web search tools instead.

## Testing Rules

- Login credentials are in `.env` (AUTH_USERNAME / AUTH_PASSWORD)
- For browser testing, set `export CI=true` before using browse/gstack tools (root environment needs --no-sandbox)

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
