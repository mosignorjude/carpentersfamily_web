# Carpenters Family Event Dashboard — unified prototype

An isolated, static redesign prototype for the general Event Dashboard. It uses synthetic sample records and does not connect to Carpenters Family, Supabase, authentication, storage, or any other service.

## Run it

Open [`index.html`](./index.html) in a current browser. There is no install step, package manager, local server, or internet connection required. The DM Sans and IBM Plex Sans font files used by the project design system are copied into `assets/fonts` so the preview can load them locally.

Changes made in the prototype stay in memory and reset when the page is refreshed. The CSV action downloads a file generated from the sample records. “Print / save as PDF” opens the browser print dialog; it does not create an official or signed statement.

## Explore the prototype

- Use the six event sections: **Overview**, **Tickets**, **Budget**, **Transactions**, **Team**, and **Reports**. Reports has **Financial summary** and **Change history** views.
- Use **Preview access** to inspect role-dependent controls. The choices are for design review and do not authenticate or grant access.
- Use **Scenario** to switch between an upcoming event, a budget-pressure example, and a new event with no records.
- Add a transaction from the event header or Transactions section. The form supports an expense, income, or ticket sale, with validation and local confirmation.
- Open a transaction to inspect its details. A pending record can be approved or rejected in the applicable preview roles. The Admin / President preview also exposes correction and void actions with a reason and confirmation.
- Adjust the budget ceiling, category shares, and ticket types from their sections. Record sales respect remaining ticket capacity; category shares cannot exceed 100%.
- Add or remove unused income categories from the Transactions section. Categories used by existing records stay in place.
- Search and filter the full transaction list by type and review status. The Reports history records changes made during the current preview session.
- The global **Meeting Hub** navigation item explains the separate app area. Meeting creation, attendance, minutes, and office controls are intentionally not duplicated here.

## Contents

- `index.html` — semantic application shell, dashboard sections, forms, dialogs, and accessible navigation.
- `styles.css` — responsive styles based on the Carpenters Family design tokens.
- `app.js` — in-memory sample data and prototype interactions.
- `prototype-audit.md` — application assessment, prototype comparison, decision matrix, feature coverage, and validation/readiness notes.
- `assets/fonts/` — local copies of DM Sans and IBM Plex Sans from the application.

See [`prototype-audit.md`](./prototype-audit.md) for the audit and important limits of this prototype.
