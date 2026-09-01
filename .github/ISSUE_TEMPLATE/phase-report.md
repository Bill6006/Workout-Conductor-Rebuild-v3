---
name: Phase report
about: Submit a completed phase for owner review
title: 'Phase <n> — <phase name> (review)'
labels: phase-report
assignees: ''
---

## Phase

Phase `<n>` — `<exact phase name>`

## Live app

- URL: https://bill6006.github.io/Workout-Conductor-Rebuild-v3/
- Build marker on screen:
- Commit:
- Workflow run:

## Delivered

<!-- What this phase actually built. Short bullets. -->

## Not in scope

<!-- What a reviewer might look for and will not find, and why that is correct. -->

## Verification

| Gate                   | Result |
| ---------------------- | ------ |
| `npm run lint`         |        |
| `npm run typecheck`    |        |
| `npm test`             |        |
| `npm run build`        |        |
| `npm run privacy:scan` |        |
| `npm run verify:build` |        |
| `npm run test:e2e`     |        |

Mobile matrix (360 / 375 / 412 / 430 at 100 / 115 / 130 / 150%):

## Screenshots

<!-- Links into docs/screenshots/<phase>/ — real app captures only. -->

## Known limitations

## Review decision

The owner reviews the live app and replies with exactly one of:

- `GREEN - NEXT PHASE`
- `YELLOW - FIX: <issue>`
- `RED - STOP`

This phase remains YELLOW until that reply is recorded here. It does not promote itself.
