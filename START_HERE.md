# DoneKite — start here

DoneKite includes an account-based web application connected to Neon PostgreSQL and a separate guided demo.

## Start the application

1. Install Node.js 24 LTS with npm. Node.js 22.13 is the minimum supported version.
2. Open a terminal in the `DoneKite` project folder.
3. Copy `.env.example` to `.env.local` and replace the placeholder URLs with your Neon connection strings. In PowerShell, use `Copy-Item .env.example .env.local`. Use the pooled URL for `DATABASE_URL` and the direct URL for `DATABASE_URL_UNPOOLED`.
4. Install the dependencies, prepare and check the database, and start the development server:

```sh
npm run install:ci
npm run db:migrate
npm run db:check
npm run dev
```

5. Open the address printed by the terminal, normally **http://127.0.0.1:3000**.
6. Choose **Create account**, enter your business name, select your industry, and use a password of at least 12 characters.

Your business starts with an empty workspace. Accounts and customer records are saved in PostgreSQL. Signing into the same account from another browser connects to the same shared records. Keep `.env.local` private; it is excluded from Git.

## Try the customer workflow

1. Add a **New enquiry** with the customer, service, quantity, and industry details.
2. Open its quote and review the saved price and tax.
3. Print the quote or open an email draft. Send it using your own email app, then select **Mark quote sent**.
4. After the customer agrees, select **Record acceptance**. The invoice rule can prepare the invoice automatically.
5. Review and share the invoice. Select **Record payment** only after receiving payment elsewhere.

Open a record and choose **Edit details** to correct customer information, notes, or industry answers. Saved pricing and workflow status are preserved. In **Enquiries**, search job details, combine status and follow-up filters, and choose a sort order. CSV export includes the visible filtered list.

Use **Rules & pricing** to select an industry and customize services, rates, quantity labels, limits, and increments. Review starter prices before using them. You can also change tax, follow-up delay, or draft preparation rules. Save your settings to share them with the team through Neon. Existing enquiries retain their original details and saved prices. Follow-ups are checked when the workspace loads or refreshes.

The theme button switches between light and dark appearance and remembers your choice in this browser. Before choosing a theme, the app follows your device preference.

The overview's **Review follow-ups** shortcut opens drafts that are ready or due. Each enquiry shows whether its follow-up is scheduled, due, ready, or paused.

## Work with a teammate

The workspace owner can open **Your team**, enter a teammate’s email, and create a personal invitation link. Copy and share that link yourself. It expires after seven days and can be used once. Teammates can view and update workspace records and pricing; only the owner can invite others.

If you belong to more than one business workspace, use the workspace selector to switch between them.

## Explore the demo

Open **http://127.0.0.1:3000/demo** for the fictional Maple & Shine presentation. It includes a guided enquiry-to-payment walkthrough, simulated time, an impact calculator, and browser-local JSON backups. Demo data is isolated from signed-in customer records.

## Verify or run a production build

```sh
npm test
npm run lint
npm run typecheck
npm run build
npm start
```

Tests use an isolated PostgreSQL engine through PGlite and do not connect to the live Neon database. The same checks run in GitHub Actions.

Use the development server for local HTTP testing. Production sessions require HTTPS. Deploy the Node/Next.js app with `DATABASE_URL` in the host's secret settings and `DONEKITE_ORIGIN` set to the public origin. Run migrations before releasing schema changes. Customer data lives in Neon; the app no longer needs a local database volume.

The old Sites/Cloudflare configuration is retained for reference. The supported app path uses Next.js; the earlier Worker publishing path has not been verified for this backend. No GitHub remote is needed to run locally. Add a remote and push when you choose a repository.

Read [README.md](README.md) for configuration and [docs/PROJECT_REVIEW.md](docs/PROJECT_REVIEW.md) for remaining launch requirements.
