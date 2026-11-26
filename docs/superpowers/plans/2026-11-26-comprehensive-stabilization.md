# Stage 02.1 Comprehensive Stabilization Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for inline execution. Follow test-driven-development and verification-before-completion.

**Goal:** Deliver one coherent, verifiable PWA export with persistent existing data, truthful offline/update states, and repeatable production diagnostics.

**Architecture:** Retain the SettingsStorage API, IndexedDB v2 on web and SQLite migrations 1–2 on native. Keep app-resource caches separate from user data. Repair the existing export/hosting and update-observer boundaries without introducing a backend or new dependencies.

**Tech Stack:** Expo 58, React Native, strict TypeScript, Cache API, Service Worker, IndexedDB, SQLite, Jest, Playwright.

**Spec:** User attachment «Этап 2.1 — Комплексная стабилизация FITapp (MassTracker)», 26.11.2026; AGENTS.md; ROADMAP.md.

## Global Constraints

- Work in the existing clean `main`; no new branches, push or deployment.
- Preserve existing features, Apple Minimal UI and database names/records.
- No stage 03 features, new dependencies or destructive migrations.
- Do not claim physical iPhone/Expo Go checks without executing them.

## Evidence before implementation

- Production worker `0d9050edcee46277b988` expects CSS SHA-256 `OtvDyRXgFSWrjZ1HGLffSM9KKncuZboHsPagPEpkZL0=` (the CSS from commit `8d1197c`). The deployed CSS is `5Fcz0TIBYyeTf4sfN8PVZynVMr2AZSI0w5tkIJMvNvQ=` (current CSS). Thus its install fails SRI: the published artifact mixes versions.
- Production version/precache URLs return the 1339-byte SPA HTML. The version URL even carries application/json despite containing HTML. The HTML lacks build metadata.
- Bundles listed by the old production worker do not include the current profile/onboarding repository. A later clean browser audit confirmed the production HTML loads a newer onboarding bundle absent from that list. Device-specific loss of profile data is not proven by this audit.
- Baseline Jest: 18 suites, 66 tests passed.

## Review Focus

1. Missing JS/JSON must fail instead of silently becoming a successful app shell.
2. Partial deployment, stale metadata and modified static bytes must fail artifact verification.
3. First install must leave the downloading state; successful update must be observable.
4. Full browser restart offline must preserve actual completed onboarding, profile, goals and settings.
5. A failed schema upgrade must keep original records; a failed update must keep the active app.

## Task 1: Export and hosting verification

**Files:** scripts/verify-web.cjs, scripts/build-web.cjs, scripts/serve-web.cjs, package.json, public/404.html, public/_redirects, tests/web-serving.test.cjs, tests/web-build-verification.test.cjs.

**Interfaces:** `verifyWebBuild(target: string): Promise<{buildId, appVersion, resources}>`, where target is a local export directory or HTTP origin; CLI accepts the same argument.

- [x] Add regression tests for unknown-route 404, explicit existing-tab rewrites and invalid/mixed build artifacts; observe failures.
- [x] Add explicit Pages rewrites plus 404, mirror them in the local server, and implement hash/metadata/MIME/routing verification.
- [x] Run verifier after production build and expose `npm run verify:web` for local/remote audits.
- [x] Run affected Jest suites, then all Jest tests.

## Task 2: Truthful update lifecycle

**Files:** src/features/pwa/offline-support.ts, src/features/pwa/pwa-status.web.tsx, tests/e2e/offline.spec.ts, tests/offline-support.test.ts as needed.

**Interfaces:** Keep existing observer callbacks; extend UpdateCheck only for confirmed installed state if needed.

- [x] Reproduce first-install status with a deliberately delayed cache resource; verify it reaches current after install instead of remaining downloading.
- [x] Verify a successful update reports the actual installed build after one reload.
- [x] Repair only confirmed state transitions; preserve form/write guards and explicit activation.
- [x] Run affected tests and full Jest suite.

## Task 3: Persistence and full verification

**Files:** tests/e2e/profile-flow.spec.ts, tests/e2e/offline.spec.ts, tests/indexeddb-settings.test.ts, documentation.

- [x] Extend full browser restart coverage to actual profile, goals and onboarding plus offline edits and a second restart; run Chromium and WebKit.
- [x] Exercise failed IndexedDB migration rollback and existing native SQLite behavior.
- [x] Run typecheck, lint, all Jest tests, production web build, artifact verification, and complete browser suites.
- [x] Review the diff for data deletion, hidden failures, architecture changes and future-stage additions.
- [x] Record causes, changed files, real test results, Cloudflare settings, publication commands and physical iPhone checklist in docs/STABILIZATION-02.1.md; keep stage IN_PROGRESS pending permitted deployment and device acceptance.

## Execution decisions

The user's detailed request authorizes implementation in main. Continue inline without a separate planning approval, per the session's autonomy instructions. No commits, push or infrastructure changes are needed to make the result reviewable.

## Verification record

- TypeScript, ESLint, full Prettier check and `git diff --check` passed.
- Full Jest suite: 78/78 tests, 20/20 suites.
- Full browser suite: 46/46 scenarios in Chromium/WebKit; independent production-export transition: 2/2. Final update UI smoke: 2/2; mobile and desktop screenshots inspected.
- Final production export `f369c3a807736c637294`: all 35 precache resources verified from disk and real local HTTP responses.
- Reviewer P2 (truncated executable worker accepted): reproducing test failed before full-body verification and passed after; full Jest suite passed afterward.
- WebKit Windows profile path changed to a short `.expo` path after diagnosing a CacheStorage filesystem failure with a 258-character path. Application code was not bypassed.
- Production audit still fails on HTML returned as version.json. Deployment, Cloudflare panel configuration and physical iPhone/Expo Go acceptance remain pending; stage remains IN_PROGRESS.
