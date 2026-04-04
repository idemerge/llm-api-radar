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

## Language Rules

- All code, scripts, comments, commit messages, and documentation must be written in **English**, unless explicitly requested otherwise by the user.
- Design docs, PRDs, and plans live in `design/` directory.
