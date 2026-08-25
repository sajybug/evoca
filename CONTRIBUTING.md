# Contributing Guide

Thank you for contributing to this project.

This document defines the required Git commit-message convention. The goal is to keep the Git history readable, searchable, auditable, and suitable for tracking AI-assisted implementation phases.

---

## Commit Message Format

All commit messages must follow this base format:

```text
<type>: <metadata> <subject>
```

### AI-assisted changes

If AI was used meaningfully during design, implementation, debugging, refactoring, or testing, include a `phase` identifier:

```text
<type>: phase-<number-or-range> [category] <subject>
```

Examples:

```text
feat: phase-20 [feature] Design event-driven sync
feat: phase-21-23 [feature] Implement sync event pipeline
fix: phase-24 [bug-fix] Prevent duplicate sync event processing
test: phase-24 [bug-fix] Cover duplicate event delivery
```

> `phase-...` is used **only** for AI-assisted work.

### Manual changes

For work completed without AI assistance, do not include a `phase` identifier:

```text
<type>: [category] <subject>
```

Examples:

```text
feat: [feature] Add sync status endpoint
fix: [bug-fix] Handle expired webhook signatures
docs: [maintenance] Document local development workflow
```

---

## Commit Types

Use one of the following types:

| Type       | Description                                                                   |
| ---------- | ----------------------------------------------------------------------------- |
| `feat`     | Introduces a new user-facing or system capability                             |
| `fix`      | Fixes incorrect behavior or a defect                                          |
| `refactor` | Changes internal code structure without changing external behavior            |
| `test`     | Adds, updates, or fixes tests                                                 |
| `docs`     | Changes documentation only                                                    |
| `perf`     | Improves performance                                                          |
| `security` | Addresses a security concern or hardening requirement                         |
| `build`    | Changes build tooling, package configuration, Docker, or runtime dependencies |
| `ci`       | Changes CI/CD pipelines or automation workflows                               |
| `chore`    | Repository maintenance or non-product operational work                        |
| `style`    | Formatting-only changes with no behavior change                               |
| `revert`   | Reverts a previous commit                                                     |

---

## Categories

Every commit must include at least one category tag.

A commit may include multiple category tags when they describe distinct
aspects of the same logical change.

| Category        | Use case                                                                         |
| --------------- | -------------------------------------------------------------------------------- |
| `[feature]`     | Planned feature or capability work                                               |
| `[bug-fix]`     | Defect correction                                                                |
| `[security]`    | Security-related work                                                            |
| `[hotfix]`      | Urgent production fix                                                            |
| `[performance]` | Performance-focused work                                                         |
| `[ai]`          | Work meaningfully assisted by AI                                                 |
| `[manual]`      | Work completed without meaningful AI assistance                                  |
| `[ui-ux]`       | Combined user-interface and user-experience work                                 |
| `[ui]`          | User-interface implementation or visual changes                                  |
| `[ux]`          | User-experience, interaction-flow, accessibility, or usability changes           |
| `[cleanup]`     | Removal of dead code, unused files, obsolete configuration, or technical clutter |

### Category Rules

- Every commit must include at least one work category, such as
  `[feature]`, `[bug-fix]`, or `[cleanup]`.
- Use `[ai]` when AI made a meaningful contribution to design,
  implementation, debugging, refactoring, or testing.
- Use `[manual]` when the work was completed without meaningful AI assistance.
- AI-assisted commits must include both `[ai]` and a `phase-...` identifier.
- Manual commits must include `[manual]` and must not include `phase-...`.
- Use `[ui-ux]` when a change affects both interface implementation and
  user experience.
- Use `[ui]` or `[ux]` individually when only one area is affected.
- Use multiple tags only when they are genuinely relevant to the same change.

### Examples

```text
feat: phase-20 [ai] [feature] Design event-driven sync
fix: phase-24 [ai] [bug-fix] Prevent duplicate sync event processing

feat: [manual] [feature] Add sync status endpoint
fix: [manual] [bug-fix] Handle expired webhook signatures

feat: phase-31 [ai] [ui] Add sync progress indicator
refactor: [manual] [ui-ux] Simplify onboarding navigation flow
fix: phase-32 [ai] [ux] Improve keyboard navigation in settings
chore: [manual] [cleanup] Remove unused legacy sync handlers
```

---

## Phase Rules

A phase identifies work that was meaningfully assisted by AI.

### Valid formats

```text
phase-20
phase-20-24
phase-101-105
```

### Rules

- Use `phase-<number>` for a single AI-assisted phase.
- Use `phase-<start>-<end>` only when one commit genuinely covers a continuous range of phases.
- Do **not** use `phase` for fully manual work.
- Do **not** use a phase number merely because AI was used for trivial autocomplete, spelling correction, or formatting.
- Prefer one phase per commit whenever possible.
- If a commit mixes AI-assisted and manual work, use `phase-...` when AI made a meaningful contribution to the implementation or decision.

---

## Subject Rules

The subject is the short description after the metadata.

### Required rules

- Write subjects in English.
- Start with an imperative verb where possible.
- Keep the subject concise and specific.
- Use sentence case.
- Do not end the subject with a period.
- Keep the full first line under **100 characters** where possible.
- Avoid vague descriptions such as `update`, `changes`, `fix issue`, or `wip`.

### Good examples

```text
feat: phase-20 [feature] Design event-driven sync
fix: phase-24 [bug-fix] Prevent duplicate sync event processing
refactor: phase-22 [feature] Extract event dispatcher
security: phase-25 [security] Redact authorization headers from logs
chore: [maintenance] Remove obsolete development scripts
```

### Bad examples

```text
update files
fix bug
wip
feat: add stuff
chore: phase-20 [feature] Changes
```

---

## Commit Body

Use a commit body when the change is non-trivial, affects architecture, introduces trade-offs, changes security behavior, or requires migration steps.

The body should explain **why** the change was made, not simply repeat what the diff already shows.

```text
fix: phase-24 [bug-fix] Prevent duplicate sync event processing

Use an atomic event-consumption lock before processing messages.
This prevents concurrent workers from handling the same event after
a retry or delayed queue delivery.

Refs: SYNC-241
```
