# Course catalog seed

`seed.db` contains the original 10,950 course records and the seven application
tables. Account, cart, enrollment, message, transaction, and swap tables are empty.
Seat capacities are simulated; this database is not a live UW registration feed.

`npm run setup` copies this seed to the ignored local database `uw_courses.db` and
creates two fictional accounts for the demo. The original project's test accounts
and their credentials are not included.
