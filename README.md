# Carpenters Family Social Club

A private member app for club finances, dues, events, attendance, announcements, polls, reports, and notifications. It uses Next.js, React, and Supabase.

## Local development

Requirements: Node.js 20.9 or later and npm.

1. Copy `.env.example` to `.env.local` and set the local Supabase URL and publishable key.
2. Install dependencies with `npm ci`.
3. Start the app with `npm run dev`.

Database development uses the Supabase CLI and Docker. Run `npx supabase start`, `npx supabase db reset`, and `npx supabase test db` to start the local database, apply migrations and seed data, and run database tests.

The GitHub Actions workflow runs dependency, lint, security-regression, production-build, and HTTP security-header checks.
