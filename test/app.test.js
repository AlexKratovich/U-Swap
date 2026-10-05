'use strict';

const {test, before, after, beforeEach} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');

const temporary = fs.mkdtempSync(path.join(__dirname, '.tmp-'));
process.env.DB_PATH = path.join(temporary, 'test.db');
fs.copyFileSync(path.join(__dirname, '..', 'data', 'seed.db'), process.env.DB_PATH);
const app = require('../app');
let server, db, base;

before(async () => {
  db = await sqlite.open({filename: process.env.DB_PATH, driver: sqlite3.Database});
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(async () => {
  await db.exec(`DELETE FROM messages; DELETE FROM swaps; DELETE FROM pending_cart;
    DELETE FROM user_courses; DELETE FROM user_transactions; DELETE FROM users;
    DELETE FROM courses;
    INSERT INTO users (id, username, password, email, major) VALUES
      (1, 'alice', 'demo-only', 'alice@example.com', 'cs'),
      (2, 'bob', 'demo-only', 'bob@example.com', 'cs'),
      (3, 'carol', 'demo-only', 'carol@example.com', 'cs');
    INSERT INTO courses (id, course_id, title, department, capacity, enrolled_count,
      required_major, prerequisites) VALUES
      (1, 'TEST 101', 'Course A', 'TEST', 1, 1, 'any', 'None'),
      (2, 'TEST 102', 'Course B', 'TEST', 1, 1, 'any', 'None'),
      (3, 'TEST 103', 'Course C', 'TEST', 2, 0, 'any', 'None'),
      (4, 'TEST 104', 'Restricted course', 'TEST', 2, 0, 'business', 'None'),
      (5, 'TEST 105', 'Advanced course', 'TEST', 2, 0, 'any', 'TEST 999');
    INSERT INTO user_courses (user_id, course_id, status) VALUES
      (1, 1, 'taking'), (2, 2, 'taking');`);
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
  await db.close();
  const resolved = path.resolve(temporary);
  if (path.dirname(resolved) !== path.resolve(__dirname) ||
      !path.basename(resolved).startsWith('.tmp-')) {
    throw new Error('Refusing to remove a directory outside the temporary test workspace.');
  }
  fs.unlinkSync(path.join(resolved, 'test.db'));
  fs.rmdirSync(resolved);
});

async function post(route, body) {
  return fetch(base + route, {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)
  });
}

async function add(userId, course_id, action, expected = 200) {
  const response = await post('/cart/add', {userId, course_id, action});
  assert.equal(response.status, expected, await response.text());
}

test('course search works with omitted filters and ranks code matches', async () => {
  let response = await fetch(base + '/classes');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).classes.length, 4);
  response = await fetch(base + '/classes?search=TEST%20103');
  assert.equal((await response.json()).classes[0].course_id, 'TEST 103');
});

test('reciprocal swaps transfer both courses, persist codes, and preserve capacity', async () => {
  await add(1, 1, 'trade');
  await add(1, 2, 'want');
  assert.equal((await post('/transaction/submit', {userId: 1})).status, 200);
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM swaps')).n, 0);
  await add(2, 2, 'trade');
  await add(2, 1, 'want');
  const response = await post('/transaction/submit', {userId: 2});
  assert.equal(response.status, 200, await response.text());
  const swap = await db.get('SELECT * FROM swaps');
  assert.equal(swap.user1_course, 'TEST 102');
  assert.equal(swap.user2_course, 'TEST 101');
  assert.equal(swap.status, 'success');
  assert.deepEqual(await db.all(`SELECT user_id, course_id FROM user_courses
    WHERE status = 'taking' ORDER BY user_id`),
    [{user_id: 1, course_id: 2}, {user_id: 2, course_id: 1}]);
  assert.equal((await db.get("SELECT COUNT(*) AS n FROM user_courses WHERE status != 'taking'")).n, 0);
  assert.deepEqual((await db.all('SELECT enrolled_count FROM courses WHERE id IN (1,2)'))
    .map(row => row.enrolled_count), [1, 1]);
  const history = await fetch(base + '/profile/getUserSwaps/1');
  assert.equal((await history.json()).userSwaps.length, 1);
});

test('a wishlist entry does not reserve a seat', async () => {
  await add(1, 3, 'want');
  assert.equal((await post('/transaction/submit', {userId: 1})).status, 200);
  assert.equal((await db.get('SELECT enrolled_count FROM courses WHERE id = 3')).enrolled_count, 0);
});

test('cart rejects duplicates, full enrollment, unmet prerequisites, and major restrictions', async () => {
  await add(1, 3, 'enroll');
  await add(1, 3, 'enroll', 400);
  await add(1, 2, 'enroll', 400);
  await add(1, 4, 'enroll', 400);
  await add(1, 5, 'enroll', 400);
  await add(1, 2, 'trade', 400);
});

test('a failed checkout rolls back earlier enrollments and preserves the cart', async () => {
  await add(1, 3, 'enroll');
  await db.run("INSERT INTO pending_cart (user_id,course_id,action) VALUES (1,4,'enroll')");
  assert.equal((await post('/transaction/submit', {userId: 1})).status, 400);
  assert.equal((await db.get('SELECT enrolled_count FROM courses WHERE id = 3')).enrolled_count, 0);
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM user_transactions')).n, 0);
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM pending_cart')).n, 2);
});

test('re-enrollment does not increase the seat count twice', async () => {
  await db.run('UPDATE courses SET capacity = 2 WHERE id = 1');
  await add(1, 1, 'enroll');
  assert.equal((await post('/transaction/submit', {userId: 1})).status, 400);
  assert.equal((await db.get('SELECT enrolled_count FROM courses WHERE id = 1')).enrolled_count, 1);
});

test('invalid users cannot add cart entries or checkout', async () => {
  await add(999, 3, 'enroll', 400);
  assert.equal((await post('/transaction/submit', {userId: 999})).status, 400);
});
