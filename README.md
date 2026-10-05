# U-Swap

A course-search and reciprocal course-swap prototype built by **Alexey Kratovich and Saleh K.** for the University of Washington's CSE 154 course in Autumn 2025.

Students search an archived UW course catalog, maintain enrollment and wishlist records, and offer courses for reciprocal trades. Matching checks whether each student offers a course the other wants, then exchanges their enrollment records.

## Features

- Search **10,950 course records** using weighted keyword matches, course-level filters, and prerequisite filters.
- Save enrollment, completed-course, wanted-course, and trade actions in a persistent cart.
- Validate seat capacity, major restrictions, and completed prerequisites before enrollment.
- Match reciprocal **two-student swaps** and display the resulting swap history.
- Record checkout transactions and confirmation codes through **19 Express endpoints** over **7 application tables**.

## Run locally

Requires Node.js 20 or newer and npm.

```sh
npm ci
npm run setup
npm start
```

Open **http://localhost:8000**. The server binds to the local machine. Set `PORT` to change its port.

Setup creates an ignored local `uw_courses.db` from the clean seed in `data/seed.db`. It preserves an existing local database. To start fresh, stop the server, remove only your local `uw_courses.db`, and run setup again.

## Try a reciprocal swap

The fictional demo accounts are **alice** and **bob**, both with the password **demo-only**.

1. Sign in as Alice. She starts enrolled in **AFRAM 101**. Find that course and add it as a course to swap; add **AFRAM 150** as a wanted course. Confirm and submit the cart.
2. Open another browser tab and sign in as Bob. He starts enrolled in **AFRAM 150**. Offer that course and request **AFRAM 101**, then confirm and submit.
3. Check the profile: the reciprocal match exchanges the courses and appears in swap history. Refresh Alice's profile to see her updated enrollment.

Seat counts are simulated. U-Swap does not access UW accounts, MyPlan, or actual registration systems.

## Tests

```sh
npm test
```

Seven integration tests cover course search, reciprocal swap persistence, seat counts, enrollment restrictions, duplicate requests, checkout rollback, and invalid user IDs. Tests use an isolated disposable database; they do not alter your demo database.

## Project structure

- `app.js`: Express endpoints, enrollment validation, search ranking, and swap matching.
- `public/`: original HTML, CSS, and client-side JavaScript interface.
- `data/seed.db`: archived course data with empty account and activity tables.
- `scripts/init-db.js`: local setup and fictional demo accounts.
- `test/app.test.js`: integration tests.
- `APIDOC.md`: endpoint reference.
- `tables.sql`: database schema.

## Authors and credits

- **Alexey Kratovich** ([AlexKratovich](https://github.com/AlexKratovich)): course-data scraping, most backend and frontend implementation, and reciprocal swap matching.
- **Saleh K. (skamel)**: project partner and coauthor. Original source-file credits are retained; a GitHub profile has not been confirmed.

The original project was developed collaboratively for CSE 154. This portfolio copy adds setup instructions, fictional demo data, regression tests, and targeted fixes to swap persistence, seat counts, search defaults, and checkout rollback. It retains the original interface and project structure.

Existing source comments credit documentation and examples used during development, including MDN, Stack Overflow, W3Schools, and a [Uiverse button example](https://uiverse.io/kamehame-ha/lovely-fly-87). The interface uses Google's [Poppins font](https://fonts.google.com/specimen/Poppins). Navigation icons in this copy are simple SVG replacements created for the portfolio cleanup.

## Prototype scope

This is a **local educational prototype**, not a production registration service. Its original stateless API accepts user IDs from the client and stores local demo passwords as plain text. Use fictional accounts and throwaway passwords. Prerequisite validation uses course-code matching in text, rather than a complete prerequisite parser. The messaging view is a placeholder; the API can read message records but does not provide a complete chat workflow.
