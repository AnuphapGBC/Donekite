# DoneKite

A web application for service businesses to manage customer enquiries, prepare quotes, track invoices, and share records with a team.

The main workspace has account registration and sign-in, Neon PostgreSQL storage, separate business workspaces, team invitation links, configurable rates and rules, activity history, and CSV export. Quote and invoice documents can be printed or opened as drafts in your email app. Payment recording tracks a payment received elsewhere; it does not charge a customer.

## Run locally

Use Node.js 24 LTS with npm. The minimum supported Node version is 22.13.

```sh
npm run install:ci
npm run db:migrate
npm run db:check
npm run dev
```

Before running the migration and development commands, copy `.env.example` to `.env.local` and replace its placeholder connection strings with your Neon values. In PowerShell, use `Copy-Item .env.example .env.local`. Use the pooled connection for `DATABASE_URL` and the direct connection for `DATABASE_URL_UNPOOLED`.

Open the address printed in the terminal, normally **http://127.0.0.1:3000**. Select **Create account** to create an empty business workspace. No preconfigured account is required.

For a sample presentation, open **/demo**. Its fictional records and simulated clock are separate from signed-in business data. Demo records remain in that browser’s local storage and support JSON backup and restore.

## Check and build

```sh
npm test
npm run lint
npm run typecheck
npm run build
npm start
```

`npm start` serves the production build on loopback. Production sign-in requires HTTPS because session cookies are marked Secure. Use `npm run dev` for local HTTP development.

## Server configuration

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Pooled Neon PostgreSQL connection string for application traffic. |
| `DATABASE_URL_UNPOOLED` | Direct connection string, recommended for schema migrations. The migration command falls back to `DATABASE_URL` when absent. |
| `DONEKITE_ORIGIN` | Public application origin, for example `https://donekite.example.com`. Set this when serving through an HTTPS reverse proxy. |

Deploy as a Node/Next.js application behind HTTPS. Configure database credentials in the host's secret settings and apply migrations before serving an updated schema. Customer records live in Neon, so the app no longer needs a local database volume. Establish and test a database backup and recovery procedure before customer use.

Keep real credentials in ignored `.env.local` files or hosting secret settings. Commit only the placeholder `.env.example`; never prefix database variables with `NEXT_PUBLIC_`. Versioned SQL migrations live in `db/migrations/`, and application tables use the `donekite` schema. Builds do not apply migrations automatically.

The retained `.openai/hosting.json`, `vite.config.ts`, Worker files, and `sites:*` commands come from the earlier Sites demo. The supported app path uses the Next.js `dev`, `build`, and `start` commands; the old Worker path has not been verified for this backend.

## GitHub

The local Git repository is prepared separately from publishing. When you choose a GitHub repository, add its URL as `origin` and push `main`. `.github/workflows/ci.yml` runs installation, tests, lint, typechecking, and the production build on pushes and pull requests. Tests use an isolated PostgreSQL engine through PGlite, so CI does not need Neon credentials or customer data.

## What is manual

- Team invitations create a personal link for the owner to share. DoneKite does not send an invitation email.
- Quote, invoice, and follow-up email actions open a draft in the user’s email app. The user reviews and sends it.
- Follow-up rules are checked when the workspace loads or refreshes; there is no unattended scheduler.
- Payments are recorded manually. No payment provider is connected.

This implementation needs operational setup before public customer use, including a tested backup process and an account recovery/identity verification plan. See [the project review](docs/PROJECT_REVIEW.md) for the implemented protections and remaining limits.

## Code map

| Path | Purpose |
| --- | --- |
| `app/page.tsx` | Session loading and entry to the signed-in application |
| `components/business-workspace.tsx` | Customer workspace, enquiries, pricing, and invitations |
| `components/customer-record.tsx` | Customer details, documents, history, and workflow actions |
| `lib/server/` and `app/api/` | Authentication, sessions, PostgreSQL storage, and workspace APIs |
| `db/migrations/` | Versioned PostgreSQL schema migrations |
| `lib/automation.ts` | Pricing snapshots, validation, workflow rules, follow-ups, and CSV export |
| `app/demo/page.tsx` | Separate guided demo using fictional browser-local data |
| `tests/` | Business-rule, storage, authentication, and HTTP boundary regression tests |

For first-time setup, read [START_HERE.md](START_HERE.md).
