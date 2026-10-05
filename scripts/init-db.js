'use strict';

const fs = require('node:fs');
const path = require('node:path');
const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');

async function main() {
  const root = path.join(__dirname, '..');
  const database = path.join(root, 'uw_courses.db');
  if (fs.existsSync(database)) {
    console.log('Database already exists; keeping your local accounts and changes.');
    return;
  }
  fs.copyFileSync(path.join(root, 'data', 'seed.db'), database);
  const db = await sqlite.open({filename: database, driver: sqlite3.Database});
  try {
    await db.run('BEGIN');
    for (const username of ['alice', 'bob']) {
      await db.run(`INSERT INTO users (username, password, email, major)
        VALUES (?, 'demo-only', ?, 'undeclared')`, [username, `${username}@example.com`]);
    }
    // Give each fictional student one course so the reciprocal swap can be demonstrated.
    for (const [username, code] of [['alice', 'AFRAM 101'], ['bob', 'AFRAM 150']]) {
      const user = await db.get('SELECT id FROM users WHERE username = ?', [username]);
      const course = await db.get('SELECT id FROM courses WHERE course_id = ?', [code]);
      await db.run(`INSERT INTO user_courses (user_id, course_id, status)
        VALUES (?, ?, 'taking')`, [user.id, course.id]);
      await db.run('UPDATE courses SET enrolled_count = 1 WHERE id = ?', [course.id]);
    }
    await db.run('COMMIT');
    console.log('Ready: 10,950 courses. Demo users: alice / bob. Password: demo-only.');
  } catch (error) {
    await db.run('ROLLBACK');
    throw error;
  } finally {
    await db.close();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
