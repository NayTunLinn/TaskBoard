# Excel tools and secure setup access

## What will change

- Replace the separate export control with one compact **Excel** menu beside **Add task**.
- Give the menu three clearly labeled actions:
  - **Download template** — a clean workbook for the selected project with instructions and valid field choices.
  - **Export project tasks** — downloads all tasks from the selected project.
  - **Import tasks** — opens a file picker, validates the workbook, previews valid rows and errors, then imports only after confirmation.
- Keep **Export MD** in the same menu as a secondary format so the header stays uncluttered.
- Show Excel tools only when the currently selected person has the **Project Manager** or **Access User** role, as requested.
- Make imports project-aware: imported rows belong to the selected project, use existing people/modules/statuses/priorities, and receive safe task IDs/codes.
- Add clear success/error feedback and prevent duplicate or invalid rows from being silently added.

## Secure setup access

- Add account sign-in for the setup area and protect setup changes behind a verified session.
- Keep project, module, and role names readable to the public board, but allow create/update/delete only for signed-in users.
- Preserve the existing no-login “pick your name” board workflow; this remains a convenience identity and is not treated as secure authorization.

## Technical details

- Use a browser-compatible Excel library for `.xlsx` generation and parsing.
- Add a focused spreadsheet utility module for workbook columns, validation, export, template generation, and import normalization.
- Use the existing task store for imported inserts so realtime updates continue to work.
- Add an import dialog with file summary, row-level validation results, and confirm/cancel controls.
- Apply database access-rule changes for `projects`, `modules`, and `roles`; add an authenticated setup page/sign-in flow without changing public board visibility.
- Record the access-model decision in the project architecture notes.

## Verification

- Download and inspect the template and populated export.
- Re-import a valid workbook and confirm tasks appear under the selected project in real time.
- Confirm malformed rows are blocked with understandable messages.
- Confirm unauthorized visitors can read the board but cannot change setup data.
- Check light/dark appearance and compact header behavior on desktop and mobile.
