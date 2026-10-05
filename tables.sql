-- U-Swap schema: 7 application tables. Course records are in data/seed.db.

CREATE TABLE "courses" (
	"id"	INTEGER,
	"course_id"	TEXT UNIQUE,
	"title"	TEXT,
	"credits"	INTEGER,
	"description"	TEXT DEFAULT 'No description',
	"prerequisites"	TEXT DEFAULT 'None',
	"department"	TEXT,
	"capacity"	INTEGER DEFAULT 30,
	"enrolled_count"	INTEGER DEFAULT 0,
	"required_major"	TEXT DEFAULT 'any',
	"prereq_course_id"	INTEGER,
	PRIMARY KEY("id" AUTOINCREMENT)
);

CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    swap_id INTEGER NOT NULL,
    receiver_id INTEGER NOT NULL,

    content TEXT NOT NULL,
    date TEXT DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (swap_id) REFERENCES swaps(id),
    FOREIGN KEY (receiver_id) REFERENCES users(id)
);

CREATE TABLE pending_cart (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, course_id INTEGER NOT NULL, action TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES users(id), FOREIGN KEY(course_id) REFERENCES courses(id));

CREATE TABLE "swaps" (
	"id"	INTEGER,
	"user1_id"	INTEGER NOT NULL,
	"user2_id"	INTEGER NOT NULL,
	"user1_course"	TEXT NOT NULL,
	"user2_course"	TEXT NOT NULL,
	"status"	TEXT NOT NULL DEFAULT 'pending',
	"created_at"	TEXT DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("user1_course") REFERENCES "courses"("course_id"),
	FOREIGN KEY("user1_id") REFERENCES "users"("id"),
	FOREIGN KEY("user2_course") REFERENCES "courses"("course_id"),
	FOREIGN KEY("user2_id") REFERENCES "users"("id")
);

CREATE TABLE "user_courses" (
	"id"	INTEGER,
	"user_id"	INTEGER NOT NULL,
	"course_id"	INTEGER NOT NULL,
	"status"	TEXT NOT NULL, transaction_id INTEGER,
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("course_id") REFERENCES "courses"("id"),
	FOREIGN KEY("user_id") REFERENCES "users"("id")
);

CREATE TABLE "user_transactions" (
	"id"	INTEGER,
	"user_id"	INTEGER NOT NULL,
	"course_id"	INTEGER NOT NULL,
	"status"	TEXT NOT NULL,
	"confirmation_code"	TEXT NOT NULL,
	"confirmation_status"	TEXT NOT NULL,
	"created_at"	TEXT DEFAULT CURRENT_TIMESTAMP,
	"date"	TEXT DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("course_id") REFERENCES "courses"("id"),
	FOREIGN KEY("user_id") REFERENCES "users"("id")
);

CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL
, major TEXT DEFAULT 'undeclared');
