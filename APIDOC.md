# U-Swap API

Local prototype base URL: `http://localhost:8000`. Requests accept JSON or form data. Successful data responses use JSON; validation errors generally return HTTP 400 with a text message, and unexpected database errors return HTTP 500.

The original API is stateless. It trusts the provided user ID; login is a demo credential check rather than server-side authorization. Use fictional accounts locally.

| Method | Endpoint | Inputs / behavior |
| --- | --- | --- |
| POST | `/auth/register` | `username`, `email`, `password`, optional `major`; creates a local account. |
| POST | `/auth/login` | `username`, `password`; returns `{username, id}`. |
| POST | `/auth/logout` | Returns a logout message; client handles its own state. |
| POST | `/remove-class` | `userId`, `course_id`, `status`; removes a profile course entry. |
| GET | `/messages` | Query `user_id`; reads message records. |
| GET | `/messages/ids` | Query `user_id`; reads message IDs and timestamps. |
| GET | `/classes/:id` | Course details by numeric database ID. |
| GET | `/classes` | Optional `search`, `level` (`all` or a number such as `100`), `prereq` (`none`, `required`, or `all`), `sort` (`name` or `level`); returns up to 25 results. |
| POST | `/cart/add` | `userId`, `course_id`, `action` (`enroll`, `history`, `want`, or `trade`); validates and saves an item. |
| GET | `/cart/:userId` | Returns saved cart items. |
| POST | `/cart/remove` | `userId`, `course_id`, `action`; removes an item. |
| POST | `/transaction/confirm` | `userId`; previews cart items and their requirements. |
| POST | `/transaction/submit` | `userId`; applies the cart and reciprocal swaps atomically. Rolls back if an item fails validation. |
| GET | `/profile/getUserSwaps/:userId` | Returns swap history and partner usernames. |
| GET | `/profile/transactions/:userId` | Returns confirmed transaction history. |
| GET | `/profile/getEnrolledClasses/:userId` | Returns enrolled courses. |
| GET | `/profile/getWantedClasses/:userId` | Returns wanted courses. |
| GET | `/profile/getGivingAwayClasses/:userId` | Returns offered courses. |
| GET | `/profile/getPastClasses/:userId` | Returns completed courses. |

`course_id` in cart requests is the numeric `courses.id`, not the display code such as `AFRAM 101`.

Example JSON request to add a wanted course:

```json
{"userId": 1, "course_id": 3, "action": "want"}
```

The actual course ID should come from `/classes`. Wanted entries do not reserve seats and can target full courses; enrollment requires an available seat. Swap history stores display course codes and updates both students' enrollment records. Matching supports reciprocal pairs, not multi-person cycles or an optimal global assignment.
