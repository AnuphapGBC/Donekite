# Project review

## Starting point

The original project was a React automation showcase with fictional customers, simulated email/payment actions, and browser-local storage. Its default commands used a Sites/Vinext Worker setup. It did not have customer accounts, a shared database, or a normal Node production server.

## Implemented improvements

- Added registration, password sign-in, logout, expiring server sessions, and empty business workspaces.
- Connected account and workspace storage to Neon PostgreSQL, replacing the local SQLite implementation.
- Added seven industry templates, dynamic enquiry questions, and editable services, rates, quantity labels, limits, and increments. Industry settings and enquiry answers are shared through Neon; historical quotes retain their original details and amounts.
- Added light and dark appearance with device preference, a browser-persisted toggle, and white document printing.
- Added versioned SQL migrations under `db/migrations/`, connection checks, and a GitHub Actions workflow.
- Added workspace membership, owner-created invitation links, and workspace switching for accounts that belong to multiple businesses.
- Added revision checks to prevent stale writes from silently overwriting another teammate’s changes.
- Connected the enquiry-to-invoice workflow to server records, with printable documents, email drafts, manual payment recording, configurable pricing, and CSV export.
- Preserved the guided sample presentation at `/demo`, separate from live customer records.
- Tightened saved-state and runtime input validation, duplicate checks, CSV formula protection, and follow-up idempotency.
- Added demo JSON backups with bounded imports, validation, replacement confirmation, corrupt-data preservation, and cross-tab save conflict detection.
- Changed the default development and production commands to standard Next.js commands.
- Removed 60 unused starter UI widgets and their sidebar-only mobile hook after tracing their imports. This cut 7,289 source lines, 15 direct dependencies, and 59 installed packages. The connector error button and its actual dependencies remain in use by the retained integration component.

The removed starter files are recoverable from the local, ignored archive `work/unused-ui-backup.tar.gz`. Application records and account storage were outside this cleanup.

## Authentication and data protections

Passwords use salted scrypt hashes. Session and invitation secrets are random tokens stored as hashes in the database. Session cookies are HttpOnly and SameSite=Lax, and are Secure in production. Sessions expire after seven days; logout revokes the stored session.

Database operations use bound parameters. Workspace reads and writes require authenticated membership. Invitations are bound to an email address, expire after seven days, and can be redeemed once. Only owners can create them. Mutations enforce a same-origin check, JSON request bodies have size limits, and repeated account login attempts are limited. Authentication responses do not expose password hashes or session tokens in JSON.

PostgreSQL transactions protect related changes. Workspace row locks and revision checks preserve shared updates, and invitation redemption is transactional. Tables use the `donekite` schema and do not rely on a pooled connection's session search path.

All team members can update workspace data and pricing. The activity list is collaboration history, not a tamper-resistant audit log.

## Verification

Run the maintained checks against the final checkout:

```sh
npm test
npm run lint
npm run typecheck
npm run build
```

The test suite covers pricing and tax, industry templates and answers, fractional quantities, historical service snapshots, migration compatibility, workflow transitions, duplicate detection, reminder timing, CSV escaping, saved-state validation, persistent account data, session expiry and revocation, tenancy, invitation restrictions, revision conflicts, request boundaries, and demo backups. Check terminal output for the result of each command; this document does not certify a deployment.

The PostgreSQL tests use an isolated PostgreSQL engine through PGlite and do not need the live Neon database or customer credentials. GitHub Actions runs installation, tests, lint, typechecking, and the build without database secrets. Migration and connectivity are separate operational checks: `npm run db:migrate` and `npm run db:check`.

On November 8, 2026, the PostgreSQL version passed all 40 tests, lint, TypeScript checking, and the production build. The schema migration was applied to the supplied Neon database and a second run confirmed it was up to date. A live Neon transaction verified accounts, shared records, invitations, revision conflicts, and login/logout; all QA writes were rolled back. Browser automation was unavailable, so visual layout, keyboard interaction, and print output still need a manual browser check.

On November 9, 2026, the industry and theme update passed all 52 tests, lint, TypeScript checking, and the production build. Migration `0002_workspace_industry.sql` was applied to the connected `donekite` database. It makes older workspaces' cleaning template explicit without rewriting rates or enquiries. A live Neon transaction verified dynamic answers, changed industry settings, original event quantities and prices, and teammate access; all QA writes were rolled back.

Isolated headless Edge checks also passed for the light/dark toggle and reload persistence, template changes, saves with reordered JSONB keys, required event questions, a 40-guest catering quote, and a blank form after reopening. The enquiry dialog fit a 375px viewport without horizontal page overflow, and no console or hydration errors were observed. Browser API responses were mocked for these checks, so they created no real accounts or customer data. Physical print output still needs a manual check.

During the simplification review, deliberately reversing the workspace identity guard caused the API regression test to fail; the original guard was restored immediately. This confirms that the test detects that cross-workspace write failure.

## Deployment requirements

Run a Node/Next.js service using Node.js 24 LTS. Configure pooled `DATABASE_URL` for application traffic and direct `DATABASE_URL_UNPOOLED` for migrations. The migration runner falls back to `DATABASE_URL` when a direct URL is absent; a direct connection is recommended. Serve through HTTPS and set `DONEKITE_ORIGIN` to the exact public origin.

Keep credentials in ignored `.env.local` files or hosting secret settings. Commit only `.env.example` placeholders and never expose database variables with `NEXT_PUBLIC_`. Customer records live in PostgreSQL, so the app no longer needs a writable local database volume.

The existing `.openai/hosting.json` and Worker configuration belong to the earlier demo. The supported app path uses Next.js; the retained `sites:*` Worker publishing path has not been verified for this backend.

Before serving customer records, establish a Neon database backup and recovery procedure and test restoration. Apply migrations before serving an updated schema and configure connection limits appropriate for the application host.

## Remaining limits for public customer use

- Email delivery and payment processing are external manual steps. Opening an email draft does not send it, and recording payment does not charge a customer.
- Follow-up drafts are evaluated on workspace access and refresh. No unattended worker sends or schedules messages while the app is closed.
- Registration does not verify email ownership, and no password recovery flow or multifactor authentication is configured. Choose and implement the account verification/recovery policy before open public registration.
- Invitation links are copied and shared by the owner. Protect them as account access links.
- Storage uses one JSON workspace snapshot with revision checking. PostgreSQL coordinates concurrent updates, but larger datasets still need more granular queries and updates. The API limits request size and record counts.
- Team management does not yet provide member removal, role changes, or an administrator account-recovery interface.
- Document templates contain the captured service and price. Configure any required business address, invoice numbering, tax registration, payment terms, and accounting process before using them as final business documents.
- Monitoring, recovery procedures, and the chosen hosting environment still need to be configured and exercised. No public deployment is claimed.

## Source control

The project has a local Git repository on `main`. Secrets, database files, generated builds, dependencies, and local backups are excluded; `.env.example` contains placeholders only. The GitHub Actions workflow is ready for a future remote. Creating a remote, pushing source, and publishing the app are separate steps.
