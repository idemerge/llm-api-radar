# E2E QA Checklist

Run all cases during `/qa` regression testing. Mark each as PASS/FAIL/SKIP.

## Login (6 cases)

- [ ] Valid credentials → redirect to workflow
- [ ] Wrong password → "Invalid username or password" error
- [ ] Empty username + empty password → "Username and password are required"
- [ ] Only username, no password → error message
- [ ] returnTo parameter → redirect to correct page after login
- [ ] Sign out → redirect to login with returnTo

## Workflow (9 cases)

- [ ] Empty name + no model → Start button disabled
- [ ] Fill name + select model → Start button enabled with correct count
- [ ] Quick Benchmark template → auto-fills name and 1 task
- [ ] Latency Profile template → auto-fills 4 tasks
- [ ] Add Task → task count increments
- [ ] Stop on Failure switch → toggles correctly
- [ ] Cooldown spinner → accepts value changes
- [ ] Model toggle (select/deselect) → updates model count in Start button
- [ ] Run workflow → completes with results displayed

## Playground (10 cases)

- [ ] Select provider → model combobox enables
- [ ] Type prompt → Run button enables
- [ ] System Prompt panel → expands/collapses
- [ ] Streaming switch → toggles
- [ ] Thinking switch → toggles
- [ ] Preset prompt (Code Generation) → fills prompt text
- [ ] History sidebar: select entry → loads prompt + response
- [ ] History sidebar: delete entry → count decreases
- [ ] History sidebar: no nested button errors in console
- [ ] Send prompt + receive streaming response

## History (6 cases)

- [ ] List page loads with workflow cards
- [ ] Pagination: next page → left button enables
- [ ] Pagination: back to page 1 → left button disables
- [ ] Page size dropdown → shows 10/20/50/100 options
- [ ] Click workflow → detail page with results table
- [ ] Refresh button → reloads data

## Settings (6 cases)

- [ ] Add Provider form → opens with empty fields
- [ ] Empty form → Save disabled
- [ ] Fill all required fields → Save enables
- [ ] Edit provider → loads existing data
- [ ] Cancel → closes form without saving
- [ ] Test Connection button → present for each provider

## Monitor (4 cases)

- [ ] Dashboard displays monitoring targets with health status
- [ ] Settings panel → opens with config fields
- [ ] Chart buttons → present for each target
- [ ] Run Check button → present

## Responsive (2 cases)

- [ ] Mobile (375x667) → sidebar collapses, content stacks
- [ ] Desktop (1100x720) → full sidebar layout

## Console Health (1 case)

- [ ] Zero project-related console errors across all pages

---

**Total: 44 cases**

## Regression Checks (run after bug fixes)

- [ ] No `<button>` nested inside `<button>` (PlaygroundHistorySidebar)
- [ ] No antd Timeline deprecation warnings (WorkflowProgress)
- [ ] Unit tests pass: `cd frontend && npm test && cd ../backend && npm test`
- [ ] Type check clean: `cd frontend && npx tsc --noEmit`
