# Stage 02.1 PWA updates implementation plan

**Goal:** Detect and safely apply production updates without reinstalling the iPhone PWA, losing profile data, or breaking offline use.

**Architecture:** Extend the existing export generator, Service Worker and PWA provider. Keep Expo Router, IndexedDB/SQLite and Apple Minimal components. HTML uses a network request validated against the active build, falling back to that build's cached shell until an explicit update. A complete waiting worker activates only outside forms and after queued writes finish. Old resource caches are removed only after the new application confirms its build.

**Spec:** User's Stage 02.1 brief; AGENTS.md; ROADMAP.md.

## Constraints and review focus

- Work in main; no push, deployment, database deletion or Stage 03.
- Unique production build IDs; no-store version and worker checks.
- Failed / partial installs retain the working version; same-origin HTML fallbacks must not pass asset integrity checks.
- Returning from the background and reconnecting must recheck even when iOS preserves a running page.
- A second app window and any active form must prevent activation; save failures prevent reload.
- Persist a per-build reload guard; never automatically reload on controllerchange.
- Retain unrelated caches and every user data store.

## Tasks

- [x] Export identity: failing generator tests, app/build metadata in HTML and version.json, fresh ID per production export, explicit hosting headers.
- [x] Worker: network-first pinned HTML, verified resource recovery, confirmed-build cleanup and complete-cache activation. Reproduce navigation/update failure in browser tests.
- [x] Client: lifecycle version checks, observable failures, waiting/installing worker detection, form and write guards, safe single reload.
- [x] UI: extend existing notices with «Позже», profile version/build and manual checks. Reuse Card/AppText/PrimaryButton and platform-specific PWA modules.
- [x] Verification: typecheck, ESLint, Jest, formatting, production exports, Chromium/WebKit offline and two-build updates including profile/goal persistence and failures.
- [x] Documentation: factual diagnosis, changed files, results and limitations, iPhone procedure; retain manual acceptance status until physical-device and production checks.

## Execution decisions

Execute in the current checkout as requested. No architecture replacement or extra dependency is required. User's detailed request authorizes implementation and testing; publication remains a separate approval boundary.

Review rulings: discover waiting workers offline; offer guarded reload for active/document mismatch without falsely claiming offline readiness; snapshot predecessors at install start, retain them for remaining app windows, and version stable resource URLs. Covered by failing-then-passing browser regressions and worker lifecycle tests. Final evidence: 66 Jest tests, 42 Chromium/WebKit scenarios, 4 extra two-export/notice scenarios, strict TypeScript/ESLint/formatting, production build with 35 verified resources. Physical iPhone and deployment acceptance remain pending as recorded in ROADMAP.md.
