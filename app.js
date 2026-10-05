/**
 * Name: Alex K & Saleh K.
 * Date: Thursday, December 11, 2025
 * Section: CSE 154
 *
 * Description: Node/Express service powering the U-SWAP experience with
 * authentication, class carts, and profile data endpoints.
 */
'use strict';

const express = require('express');
const sqlite3 = require('sqlite3');
const sqlite = require('sqlite');
const multer = require('multer');
const path = require('node:path');

const app = express();
app.use(express.urlencoded({extended: true}));
app.use(express.json());
app.use(multer().none());
app.use(express.static(path.join(__dirname, 'public')));

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'uw_courses.db');
const STATUS_TAKING = 'taking';
const STATUS_PAST = 'past';
const STATUS_WANTED = 'wanted';
const STATUS_GIVING = 'offering';
const ACTION_ENROLL = 'enroll';
const ACTION_HISTORY = 'history';
const ACTION_WANT = "want";
const ACTION_TRADE = "trade";

// Registers a new user with username, email, password, and optional major.
app.post('/auth/register', async function(req, res) {
  let email = (req.body.email || '').trim();
  let password = (req.body.password || '').trim();
  let username = (req.body.username || '').trim();
  let major = (req.body.major || 'undeclared').trim();
  if (!email || !password || !username) {
    res.type('text').status(400)
      .send('Missing one or more of the required params.');
  } else {
    try {
      let db = await getDBConnection();
      let existing = await db.get('SELECT id FROM users WHERE email = ? OR username = ?',
        [email, username]);
      if (existing) {
        await db.close();
        res.type('text').status(400)
          .send('Email or username already exists.');
      } else {
        await db.run(`
          INSERT INTO users (username, password, email, major)
          VALUES (?, ?, ?, ?)
        `, [username, password, email, major || 'undeclared']);
        await db.close();
        res.type('text').send('successfully registered user');
      }
    } catch (err) {
      res.type('text').status(500)
        .send('An error occurred on the server. Try again later.');
    }
  }
});

// Logs in a user by validating credentials and returning their account info.
app.post('/auth/login', async function(req, res) {
  let username = (req.body.username || '').trim();
  let password = (req.body.password || '').trim();
  if (!username || !password) {
    res.type('text').status(400)
      .send('Missing one or more of the required params.');
  } else {
    try {
      let db = await getDBConnection();
      let user = await db.get(`
        SELECT id, username, email, major
        FROM users
        WHERE username = ? AND password = ?
      `, [username, password]);
      await db.close();
      if (!user) {
        res.type('text').status(400)
          .send('Invalid username or password.');
      } else {
        res.json({username: user.username, id: user.id});
      }
    } catch (err) {
      res.type('text').status(500)
        .send('An error occurred on the server. Try again later.');
    }
  }
});

// Logs out the current user session if one exists.
app.post('/auth/logout', function(req, res) {
  res.type('text')
    .send('logout successful');
});

// Removes a course entry for a given status without touching capacity logic yet.
app.post('/remove-class', async function(req, res) {
  let courseId = req.body.course_id;
  let status = req.body.status;
  let userId = req.body.userId;
  if (!courseId || !status) {
    res.type('text').status(400)
      .send('Missing one or more of the required params.');
  } else {
    try {
      let db = await getDBConnection();
      let code = await generateConfirmationCode(db);
      let result = await db.run(`
        DELETE FROM user_courses WHERE user_id = ? AND course_id = ? AND status = ?
      `, [userId, courseId, status]);
      await db.run(`
        INSERT INTO user_transactions (user_id, course_id, status,
          confirmation_code, confirmation_status)
        VALUES (?, ?, ?, ?, ?)
      `, [userId, courseId, status + '-dropped', code, 'success']);
      await db.close();
      if (!result.changes) {
        res.type('text').status(400)
          .send('Class not found for user.');
      } else {
        res.type("text")
          .send('Class removed.');
      }
    } catch (err) {
      res.type('text').status(500)
        .send('An error occurred on the server. Try again later.');
    }
  }
});

// Fetches latest swap-related messages for the logged-in user.
app.get('/messages', async function(req, res) {
  try {
    let userId = req.query.user_id || req.body?.user_id;
    let db = await getDBConnection();
    let rows = await db.all(`
      SELECT m.id, m.swap_id, m.content, m.date,
             s.user1_id, s.user2_id, s.user1_course, s.user2_course, s.status
      FROM messages m
      JOIN swaps s ON m.swap_id = s.id
      WHERE m.receiver_id = ?
      ORDER BY m.date DESC
    `, [userId]);
    await db.close();
    res.json({messages: rows});
  } catch (err) {
    res.type('text').status(500)
      .send('An error occurred on the server. Try again later.');
  }
});

// Returns just the message identifiers for quick polling.
app.get('/messages/ids', async function(req, res) {
  try {
    let userId = req.query.user_id || req.body?.user_id;
    let db = await getDBConnection();
    let ids = await db.all(`
      SELECT id, swap_id, date
      FROM messages
      WHERE receiver_id = ?
      ORDER BY date DESC
    `, [userId]);
    await db.close();
    res.json({messages: ids});
  } catch (err) {
    res.type('text').status(500)
      .send('An error occurred on the server. Try again later.');
  }
});

// Returns detailed information for a single class by numeric id.
app.get('/classes/:id', async function(req, res) {
  let id = req.params.id;
  try {
    let db = await getDBConnection();
    let row = await db.get(`
      SELECT
        id,
        course_id,
        title,
        credits,
        description,
        prerequisites,
        department,
        capacity,
        enrolled_count,
        required_major
      FROM courses
      WHERE id = ?
    `, [id]);
    await db.close();
    if (!row) {
      res.type('text').status(400)
        .send('Course not found.');
    } else {
      res.json(row);
    }
  } catch (err) {
    res.type('text').status(500)
      .send('An error occurred on the server. Try again later.');
  }
});

// Adds an action (enroll/history/want/trade) to the pending cart after validation.
app.post('/cart/add', async function (req, res) {
  let courseId = parseInt(req.body.course_id);
  let action = (req.body.action || '').trim();
  let type = normalizeAction(action);
  let userId = req.body.userId;
  if (!courseId || !type) {
    res.status(400)
      .send("Missing course_id or action.");
  } else {
    try {
      let db = await getDBConnection();
      let duplicate = await db.get(`
        SELECT id FROM pending_cart
        WHERE user_id = ? AND course_id = ? AND action = ?
      `, [userId, courseId, type]);
      let errorMessage = "";
      // Prevent duplicate cart entries for the same course/action combination.
      if (duplicate) {
        errorMessage = "Class already in cart.";
      } else {
        let user = await db.get(`
          SELECT id, major FROM users WHERE id = ?
        `, [userId]);
        // Each action reuses specific validation rules before reaching checkout.
        if (!user) {
          errorMessage = "User not found.";
        } else if (type === ACTION_ENROLL || type === ACTION_WANT) {
          let summary = await buildEnrollSummary(db, [courseId], user);
          if (!summary.length) {
            errorMessage = "Course not found.";
          } else {
            let info = summary[0];
            if (type === ACTION_ENROLL && !info.meets_capacity) {
              errorMessage = "Class is full.";
            } else if (!info.meets_major) {
              errorMessage = "Major requirement not met.";
            } else if (!info.meets_prereqs) {
              errorMessage = "Prerequisites not met.";
            }
          }
        } else if (type === ACTION_HISTORY) {
          let exists = await db.get(`SELECT id FROM courses WHERE id = ?`, [courseId]);
          if (!exists) {
            errorMessage = "Course not found.";
          }
        } else if (type === ACTION_TRADE) {
          let enrolled = await db.get(`
            SELECT id FROM user_courses
            WHERE user_id = ? AND course_id = ? AND status = ?
          `, [user.id, courseId, STATUS_TAKING]);
          if (!enrolled) {
            errorMessage = "You cannot trade away a class you are not currently enrolled in.";
          }
        }
      }
      // Only add to pending_cart after all checks succeed.
      if (!errorMessage) {
        await db.run(`
          INSERT INTO pending_cart (user_id, course_id, action)
          VALUES (?, ?, ?)
        `, [userId, courseId, type]);
        await db.close();
        res.json({ message: "Added to cart." });
      } else {
        await db.close();
        res.status(400)
          .send(errorMessage);
      }
    } catch (err) {
      res.status(500)
        .send("Server error.");
    }
  }
});

// Returns the current user's pending cart with all queued actions.
app.get('/cart/:userId', async function(req, res) {
  try {
    let userId = req.params.userId;
    let db = await getDBConnection();
    let cart = await getUserCart(db, userId);
    await db.close();
    res.json({items: cart});
  } catch (err) {
    res.type('text').status(500)
      .send('An error occurred on the server. Try again later.');
  }
});

// Removes a specific pending cart entry for the given action.
app.post('/cart/remove', async function(req, res) {
  let courseId = parseInt(req.body.course_id, 10);
  let action = (req.body.action || '').trim();
  let type = normalizeAction(action);
  let userId = req.body.userId;
  if (!courseId || !type) {
    res.type('text').status(400)
      .send('Missing course_id or action.');
  } else {
    try {
      let db = await getDBConnection();
      let result = await db.run(`
        DELETE FROM pending_cart
        WHERE user_id = ? AND course_id = ? AND action = ?
      `, [userId, courseId, type]);
      await db.close();
      if (!result.changes) {
        res.type('text').status(400)
          .send('Item not found in cart.');
      } else {
        res.json({message: 'Removed from cart.'});
      }
    } catch (err) {
      res.type('text').status(500)
        .send('An error occurred on the server. Try again later.');
    }
  }
});

// Builds previews for each cart action so users can see requirements before submitting.
app.post('/transaction/confirm', async (req, res) => {
  try {
    let userId = req.body.userId;
    let db = await getDBConnection();
    let user = await db.get("SELECT id, major FROM users WHERE id = ?", [userId]);
    let pending = await getUserCart(db, userId);
    if (!pending.length) {
      await db.close();
      res.status(400)
        .send("Cart is empty.");
    } else {
      let enrollIds = pending.filter(p => p.action === ACTION_ENROLL).map(p => p.course_id);
      let historyIds = pending.filter(p => p.action === ACTION_HISTORY).map(p => p.course_id);
      let wantIds   = pending.filter(p => p.action === ACTION_WANT).map(p => p.course_id);
      let tradeIds  = pending.filter(p => p.action === ACTION_TRADE).map(p => p.course_id);
      let enrollSummary = await buildEnrollSummary(db, enrollIds, user);
      let historySummary = await buildHistorySummary(db, historyIds);
      let wantSummary = await buildWantSummary(db, wantIds, user);
      let tradeSummary = await buildTradeSummary(db, tradeIds);
      await db.close();
      res.json({
        enroll: enrollSummary,
        history: historySummary,
        want: wantSummary,
        trade: tradeSummary,
        message: "Cart confirmed. Ready to checkout."
      });
    }
  } catch (err) {
    res.status(500)
      .send("Server error");
  }
});

// Processes every cart action, records transactions, and clears processed items.
app.post('/transaction/submit', async function(req, res) {
  let db;
  let inTransaction = false;
  let responseStatus = 200;
  let responseBody;
  try {
    let userId = req.body.userId;
    db = await getDBConnection();
    await db.run('BEGIN IMMEDIATE');
    inTransaction = true;
    let user = await db.get('SELECT id, major FROM users WHERE id = ?', [userId]);
    let pending = await getUserCart(db, userId);
    if (!user || !pending.length) {
      responseStatus = 400;
      responseBody = !user ? 'User not found.' : 'Cart is empty.';
    } else {
      let confirmations = [];
      let errorMessage = "";
      for (let entry of pending) {
        let result;
        if (entry.action === ACTION_ENROLL) {
          result = await processEnrollment(db, user, entry.course_id);
        } else if (entry.action === ACTION_HISTORY) {
          result = await processHistory(db, user, entry.course_id);
        } else if (entry.action === ACTION_TRADE) {
          result = await processTrade(db, user, entry.course_id);
        } else {
          result = await processWant(db, user, entry.course_id);
        }
        if (!result.success) {
          errorMessage = result.message;
          break;
        }
        confirmations.push(result.payload);
        await db.run(`
          DELETE FROM pending_cart
          WHERE id = ?
        `, [entry.id]);
      }
      if (errorMessage) {
        responseStatus = 400;
        responseBody = errorMessage;
      } else {
        await findSwapMatches(db, userId);
        await db.run('COMMIT');
        inTransaction = false;
        responseBody = {transactions: confirmations};
      }
    }
  } catch (err) {
    console.error('Checkout failed:', err.message);
    responseStatus = 500;
    responseBody = 'An error occurred on the server. Try again later.';
  } finally {
    if (db) {
      if (inTransaction) await db.run('ROLLBACK');
      await db.close();
    }
  }
  if (responseStatus === 200) {
    res.json(responseBody);
  } else {
    res.type('text').status(responseStatus).send(responseBody);
  }
});

// Loads swap history for the logged-in user including partners and classes.
app.get('/profile/getUserSwaps/:userId', async function(req, res) {
  try {
    //let userId = req.body.user_id || req.query.user_id;
    let userId = req.params.userId;
    let db = await getDBConnection();
    let allSwaps = await db.all(`
      SELECT
        s.id,
        u1.username AS user1_username,
        u2.username AS user2_username,
        s.user1_course,
        s.user2_course,
        s.status,
        s.created_at
      FROM swaps s
      JOIN users u1 ON s.user1_id = u1.id
      JOIN users u2 ON s.user2_id = u2.id
      WHERE (s.user1_id = ? OR s.user2_id = ?)
      ORDER BY s.created_at DESC
    `, [userId, userId]);
    await db.close();
    res.json( {userSwaps : allSwaps} );
  } catch (err) {
    res.type('text').status(500)
      .send('An error occurred on the server. Try again later.');
  }
});

// Returns the user's confirmed transactions for display on the profile page.
app.get('/profile/transactions/:userId', async function(req, res) {
  try {
    //let userId = req.body.user_id || req.query.user_id;
    let userId = req.params.userId;
    let db = await getDBConnection();
    let rows = await db.all(`
      SELECT
        ut.id,
        ut.status,
        ut.confirmation_code,
        ut.confirmation_status,
        ut.date,
        c.course_id AS course_code,
        c.title,
        c.id AS course_id
      FROM user_transactions ut
      JOIN courses c ON ut.course_id = c.id
      WHERE ut.user_id = ? AND ut.confirmation_status = 'success'
      ORDER BY ut.date DESC
    `, [userId]);
    await db.close();
    res.json({transactions: rows});
  } catch (err) {
    res.type('text').status(500)
      .send('An error occurred on the server. Try again later.');
  }
});

// Returns currently enrolled classes; this route can fetch other users by id.
app.get('/profile/getEnrolledClasses/:userId', async function(req, res) {
  try {
    let userId = req.params.userId;
    let db = await getDBConnection();
    let enrolledClasses = await getUserCoursesByStatus(db, userId, STATUS_TAKING);
    await db.close();
    res.json( {enrolledClasses : enrolledClasses} );
  } catch (err) {
    res.type('text').status(500)
      .send('An error occurred on the server. Try again later.');
  }
});

// Shows all wanted (wishlist) classes for the logged-in user.
app.get('/profile/getWantedClasses/:userId', async function(req, res) {
  try {
    //let userId = req.body.user_id || req.query.user_id;
    let userId = req.params.userId;
    let db = await getDBConnection();
    let wantedClasses = await getUserCoursesByStatus(db, userId, STATUS_WANTED);
    await db.close();
    res.json( {wantedClasses : wantedClasses} );
  } catch (err) {
    res.type('text').status(500)
      .send('An error occurred on the server. Try again later.');
  }
});

// Lists courses the user is offering or giving away.
app.get('/profile/getGivingAwayClasses/:userId', async function(req, res) {
  try {
    //let userId = req.body.user_id || req.query.user_id;
    let userId = req.params.userId;
    let db = await getDBConnection();
    let givingAwayClasses = await getUserCoursesByStatus(db, userId, STATUS_GIVING);
    await db.close();
    res.json( {givingAwayClasses : givingAwayClasses} );
  } catch (err) {
    res.type('text').status(500)
      .send('An error occurred on the server. Try again later.');
  }
});

// Provides every past/completed course for the user.
app.get('/profile/getPastClasses/:userId', async function(req, res) {
  try {
    //let userId = req.body.user_id || req.query.user_id;
    let userId = req.params.userId;
    let db = await getDBConnection();
    let getPastClasses = await getUserCoursesByStatus(db, userId, STATUS_PAST);
    await db.close();
    res.json( {pastClasses : getPastClasses} );
  } catch (err) {
    res.type('text').status(500)
      .send('An error occurred on the server. Try again later.');
  }
});

// https://stackoverflow.com/questions/78127483/sqlite-select-0-or-null-vs-select-1-or-null-strange-result
// Performs the searchable course catalog request with optional filters.
app.get('/classes', async (req, res) => {
  let search = String(req.query.search || '').trim().toLowerCase();
  let level = String(req.query.level || 'all').trim().toLowerCase();
  let prereq = String(req.query.prereq || 'none').trim().toLowerCase();
  let sort = String(req.query.sort || 'name').trim().toLowerCase();

  try {
    let db = await getDBConnection();
    let wordFilters = [];
    let otherFilters = [];
    let params = [];
    let scores = [];
    let scoreParams = [];
    buildSearchFilters(search, wordFilters, params, scores, scoreParams);
    buildLevelFilter(level, otherFilters, params);
    buildPrereqFilter(prereq, otherFilters);
    let calculatedClassScore = "";
    if (scores.length > 0) {
      calculatedClassScore = ", ("
      calculatedClassScore += scores.join(" + ")
      calculatedClassScore += ") AS sortScore";
    }
    // Build query
    let query = buildBaseQuery(wordFilters, otherFilters, calculatedClassScore);
    let hasScores = scores.length > 0;
    query += buildSorting(sort, hasScores);
    query += " LIMIT 25";
    let rows = await db.all(query, scoreParams.concat(params));
    await db.close();
    res.json({ classes: rows });
  } catch (err) {
    res.status(500)
      .send("Server error.");
  }
});

/**
 * Builds validation and metadata summaries for a list of course IDs
 * when a user attempts to enroll or add them to a wishlist.
 * Checks for: capacity availability, major requirements, prerequisite completion
 * @param {sqlite.Database} db - Open SQLite database connection.
 * @param {number[]} ids - Array of course IDs to summarize.
 * @param {{id: number, major: string}} user - User info object.
 * @returns {Array} Array of summary objects containing:
 * id, code,ctitle, meets_capacity, Meets_major, meets_prereqs
 */
async function buildEnrollSummary(db, ids, user) {
  let summary = [];
  for (let id of ids) {
    let course = await db.get(`
      SELECT id, course_id, title, capacity, enrolled_count, required_major, prerequisites
      FROM courses
      WHERE id = ?
    `, [id]);
    if (course) {
      let meetsCapacity = course.enrolled_count < course.capacity;
      let meetsMajor = course.required_major === 'any' || course.required_major === user.major;
      let meetsPrereqs = await hasCompletedCourse(db, user.id, course.prerequisites);
      summary.push({
        id: course.id,
        code: course.course_id,
        title: course.title,
        meets_capacity: meetsCapacity,
        meets_major: meetsMajor,
        meets_prereqs: meetsPrereqs
      });
    }
  }
  return summary;
}

/**
 * Constructs a summary for courses being considered for trade.
 * @async
 * @param {sqlite.Database} db - Database connection.
 * @param {number[]} ids - Course IDs the user wants to trade away.
 * @returns {Array} Array of objects containing: id, code, title
 */
async function buildTradeSummary(db, ids) {
  let summary = [];
  for (let id of ids) {
    let course = await db.get(`
      SELECT id, course_id, title
      FROM courses
      WHERE id = ?
    `, [id]);
    if (course) {
      summary.push({
        id: course.id,
        code: course.course_id,
        title: course.title
      });
    }
  }
  return summary;
}


/**
 * Constructs a summary for courses being added to history.
 * @async
 * @param {sqlite.Database} db - Database connection.
 * @param {number[]} ids - Course IDs the user wants to trade away.
 * @returns {Array} Array of objects containing: id, code, title
 */
async function buildHistorySummary(db, ids) {
  let summary = [];
  for (let id of ids) {
    let course = await db.get(`
      SELECT id, course_id, title
      FROM courses
      WHERE id = ?
    `, [id]);
    if (course) {
      summary.push({
        id: course.id,
        code: course.course_id,
        title: course.title
      });
    }
  }
  return summary;
}

/**
 * Constructs a summary for courses user wants.
 * @async
 * @param {sqlite.Database} db - Database connection.
 * @param {number[]} ids - Course IDs the user wants to trade away.
 * @returns {Array} Array of objects containing: id, code, title
 */
async function buildWantSummary(db, ids, user) {
  let summary = [];
  for (let id of ids) {
    let course = await db.get(`
      SELECT id, course_id, title, capacity, enrolled_count, required_major, prerequisites
      FROM courses
      WHERE id = ?
    `, [id]);
    if (course) {
      let meetsCapacity = course.enrolled_count < course.capacity;
      let meetsPrereqs = await hasCompletedCourse(db, user.id, course.prerequisites);
      summary.push({
        id: course.id,
        code: course.course_id,
        title: course.title,
        meets_capacity: meetsCapacity,
        meets_prereqs: meetsPrereqs
      });
    }
  }
  return summary;
}

// Finalizes an enrollment transaction and writes it into user_courses.
async function processEnrollment(db, user, courseId) {
  let course = await db.get(`
    SELECT id, course_id, title, capacity, enrolled_count, required_major, prerequisites
    FROM courses
    WHERE id = ?
  `, [courseId]);
  if (!course) {
    return {success: false, message: 'Course not found.'};
  }
  if (course.enrolled_count >= course.capacity) {
    return {success: false, message: 'Class is full'};
  }
  if (course.required_major !== 'any' && course.required_major !== user.major) {
    return {success: false, message: 'User not in required major'};
  }
  if (!(await hasCompletedCourse(db, user.id, course.prerequisites))) {
    return {success: false, message: 'Missing prerequisites'};
  }
  let enrolled = await db.get(`
    SELECT id FROM user_courses WHERE user_id = ? AND course_id = ? AND status = ?
  `, [user.id, course.id, STATUS_TAKING]);
  if (enrolled) {
    return {success: false, message: 'Already enrolled in this class.'};
  }
  let code = await generateConfirmationCode(db);
  let insert = await db.run(`
    INSERT INTO user_transactions (user_id, course_id, status, confirmation_code, confirmation_status)
    VALUES (?, ?, ?, ?, ?)
  `, [user.id, course.id, 'enrolled', code, 'success']);
  let transactionId = insert.lastID;
  let existing = await db.get(`
    SELECT id
    FROM user_courses
    WHERE user_id = ? AND course_id = ? AND status = ?
  `, [user.id, course.id, STATUS_TAKING]);
  if (existing) {
    await db.run(`
      UPDATE user_courses
      SET status = ?, transaction_id = ?
      WHERE id = ?
    `, [STATUS_TAKING, transactionId, existing.id]);
  } else {
    await db.run(`
      INSERT INTO user_courses (user_id, course_id, status, transaction_id)
      VALUES (?, ?, ?, ?)
    `, [user.id, course.id, STATUS_TAKING, transactionId]);
  }
  await db.run(`
    UPDATE courses
    SET enrolled_count = enrolled_count + 1
    WHERE id = ?
  `, [course.id]);
  return {
    success: true,
    payload: {
      transaction_id: transactionId,
      confirmation_code: code,
      course: {
        id: course.id,
        code: course.course_id,
        title: course.title
      },
      status: 'enrolled'
    }
  };
}

// Records a wishlist entry without reserving a seat; full classes can be wanted.
async function processWant(db, user, courseId) {
  let course = await db.get(`
    SELECT id, course_id, title, capacity, enrolled_count, required_major, prerequisites
    FROM courses
    WHERE id = ?
  `, [courseId]);
  if (!course) {
    return {success: false, message: 'Course not found.'};
  }
  if (course.required_major !== 'any' && course.required_major !== user.major) {
    return {success: false, message: 'User not in required major'};
  }
  if (!(await hasCompletedCourse(db, user.id, course.prerequisites))) {
    return {success: false, message: 'Missing prerequisites'};
  }

  let code = await generateConfirmationCode(db);
  let insert = await db.run(`
    INSERT INTO user_transactions (user_id, course_id, status, confirmation_code, confirmation_status)
    VALUES (?, ?, ?, ?, ?)
  `, [user.id, course.id, 'wanted', code, 'success']);
  let transactionId = insert.lastID;
  let existing = await db.get(`
    SELECT id
    FROM user_courses
    WHERE user_id = ? AND course_id = ? AND status = ?
  `, [user.id, course.id, STATUS_WANTED]);
  if (existing) {
    await db.run(`
      UPDATE user_courses
      SET status = ?, transaction_id = ?
      WHERE id = ?
    `, [STATUS_WANTED, transactionId, existing.id]);
  } else {
    await db.run(`
      INSERT INTO user_courses (user_id, course_id, status, transaction_id)
      VALUES (?, ?, ?, ?)
    `, [user.id, course.id, STATUS_WANTED, transactionId]);
  }
  return {
    success: true,
    payload: {
      transaction_id: transactionId,
      confirmation_code: code,
      course: {
        id: course.id,
        code: course.course_id,
        title: course.title
      },
      status: 'wanted'
    }
  };
}

// Moves a currently enrolled class into the giving/offering status for swaps.
async function processTrade(db, user, courseId) {
  let course = await db.get(`
    SELECT id, course_id, title, capacity, enrolled_count, prerequisites
    FROM courses
    WHERE id = ?
  `, [courseId]);
  if (!course) {
    return {success: false, message: 'Course not found.'};
  }
  let enrolled = await db.get(`
    SELECT id FROM user_courses WHERE user_id = ? AND course_id = ? AND status = ?
  `, [user.id, course.id, STATUS_TAKING]);
  if (!enrolled) {
    return {success: false, message: 'You cannot trade a class you are not enrolled in.'};
  }

  let code = await generateConfirmationCode(db);
  let insert = await db.run(`
    INSERT INTO user_transactions (user_id, course_id, status, confirmation_code, confirmation_status)
    VALUES (?, ?, ?, ?, ?)
  `, [user.id, course.id, 'trading', code, 'success']);
  let transactionId = insert.lastID;
  let existing = await db.get(`
    SELECT id
    FROM user_courses
    WHERE user_id = ? AND course_id = ? AND status = ?
  `, [user.id, course.id, STATUS_GIVING]);
  if (existing) {
    await db.run(`
      UPDATE user_courses
      SET status = ?, transaction_id = ?
      WHERE id = ?
    `, [STATUS_GIVING, transactionId, existing.id]);
  } else {
    await db.run(`
      INSERT INTO user_courses (user_id, course_id, status, transaction_id)
      VALUES (?, ?, ?, ?)
    `, [user.id, course.id, STATUS_GIVING, transactionId]);
  }
  return {
    success: true,
    payload: {
      transaction_id: transactionId,
      confirmation_code: code,
      course: {
        id: course.id,
        code: course.course_id,
        title: course.title
      },
      status: 'trading'
    }
  };
}

// Marks a class as completed history without touching capacity counts.
async function processHistory(db, user, courseId) {
  let course = await db.get(`
    SELECT id, course_id, title
    FROM courses
    WHERE id = ?
  `, [courseId]);
  if (!course) {
    return {success: false, message: 'Course not found.'};
  }
  let code = await generateConfirmationCode(db);
  let insert = await db.run(`
    INSERT INTO user_transactions (user_id, course_id, status, confirmation_code, confirmation_status)
    VALUES (?, ?, ?, ?, ?)
  `, [user.id, course.id, 'history', code, 'success']);
  let transactionId = insert.lastID;
  let existing = await db.get(`
    SELECT id
    FROM user_courses
    WHERE user_id = ? AND course_id = ? AND status = ?
  `, [user.id, course.id, STATUS_PAST]);
  if (existing) {
    await db.run(`
      UPDATE user_courses
      SET status = ?, transaction_id = ?
      WHERE id = ?
    `, [STATUS_PAST, transactionId, existing.id]);
  } else {
    await db.run(`
      INSERT INTO user_courses (user_id, course_id, status, transaction_id)
      VALUES (?, ?, ?, ?)
    `, [user.id, course.id, STATUS_PAST, transactionId]);
  }
  return {
    success: true,
    payload: {
      transaction_id: transactionId,
      confirmation_code: code,
      course: {
        id: course.id,
        code: course.course_id,
        title: course.title
      },
      status: 'history'
    }
  };
}

// Checks if the user has already finished prerequisite classes listed in text.
async function hasCompletedCourse(db, userId, prereqText) {
  if (!prereqText) {
    return true;
  }
  let normalized = String(prereqText).trim();
  if (!normalized || normalized.toLowerCase() === 'none') {
    return true;
  }
  let taken = await db.all(`
    SELECT c.course_id AS course_code
    FROM user_courses uc
    JOIN courses c ON uc.course_id = c.id
    WHERE uc.user_id = ? AND uc.status = ?
  `, [userId, STATUS_PAST]);
  if (!taken || taken.length === 0) {
    return false;
  }
  let upperText = normalized.toUpperCase();
  for (let row of taken) {
    if (row.course_code && upperText.includes(row.course_code.toUpperCase())) {
      return true;
    }
  }
  return false;
}

// Generates a unique confirmation code for user transactions.
async function generateConfirmationCode(db) {
  let code = "";
  let found = true;
  while (found) {
    code = Math.random().toString(36).substring(2, 10).toUpperCase();
    let existing = await db.get(`
      SELECT id
      FROM user_transactions
      WHERE confirmation_code = ?
    `, [code]);
    found = Boolean(existing);
  }
  return code;
}

// Opens a SQLite connection using the project database path.
async function getDBConnection() {
  return sqlite.open({
    filename: DB_PATH,
    driver: sqlite3.Database
  });
}

// Standardizes many user-friendly action words into the four action constants.
 function normalizeAction(action) {
  if (!action) return null;
  let lower = action.toLowerCase().trim();
  if (lower === "enroll" || lower === "current") {
    return ACTION_ENROLL;
  }
  if (lower === "history" || lower === "taken" || lower === "past") {
    return ACTION_HISTORY;
  }
  if (lower === "want" || lower === "wanted" || lower === "wishlist") {
    return ACTION_WANT;
  }
  if (lower === "trade" || lower === "drop" || lower === "give" || lower === "swap") {
    return ACTION_TRADE;
  }
  return null;
}

// Helper to reuse the same query for all profile course lookups.
async function getUserCoursesByStatus(db, userId, status) {
  return db.all(`
    SELECT
      uc.status,
      c.id AS course_id,
      c.course_id AS course_code,
      c.title,
      c.credits,
      c.description,
      c.prerequisites,
      c.capacity,
      c.enrolled_count
    FROM user_courses uc
    JOIN courses c ON uc.course_id = c.id
    WHERE uc.user_id = ? AND uc.status = ?
  `, [userId, status]);
}

// Pulls the pending cart rows plus readable course details.
async function getUserCart(db, userId) {
  return db.all(`
    SELECT pc.id, pc.course_id, pc.action, c.course_id AS course_code, c.title
    FROM pending_cart pc
    JOIN courses c ON pc.course_id = c.id
    WHERE pc.user_id = ?
    ORDER BY pc.created_at DESC, pc.id DESC
  `, [userId]);
}

// Builds the SELECT statement for course searches using the gathered filters.
function buildBaseQuery(wordFilters, otherFilters, calculatedClassScore) {
  let query = `
    SELECT
      id,
      course_id,
      title
      ${calculatedClassScore}
    FROM courses
  `;
  let combinedFilters = [];
  if (wordFilters.length > 0) {
    combinedFilters.push("(" + wordFilters.join(" OR ") + ")");
  }

  if (otherFilters.length > 0) {
    combinedFilters.push(otherFilters.join(" AND "));
  }
  if (combinedFilters.length > 0) {
    query += " WHERE " + combinedFilters.join(" AND ");
  }
  return query;
}

// https://stackoverflow.com/questions/14912502/how-do-i-split-a-string-by-whitespace-and-ignoring-leading-and-trailing-whitespa
// https://stackoverflow.com/questions/22132814/how-do-sql-order-by-with-multiple-columns-work
// Adds flexible keyword matching filters and scoring for search terms.
function buildSearchFilters(search, filters, params, scores, scoreParams) {
  if (search) {

    // regex split words
    let words = search.trim().split(/\s+/);

    for (let word of words) {
      let pattern = `%${word}%`;
      filters.push(`
        (course_id LIKE ? OR
        title LIKE ? OR
        department LIKE ? OR
        description LIKE ?)
      `);
      params.push(pattern, pattern, pattern, pattern);
      scores.push(`
        (course_id LIKE ?) * 15 +
        (title LIKE ?) * 10 +
        (department LIKE ?) * 5 +
        (description LIKE ?) * 3
      `);
      scoreParams.push(pattern, pattern, pattern, pattern);
    }
  }

}

// https://stackoverflow.com/questions/32953639/how-to-type-cast-in-sqlite3
// https://www.sqlitetutorial.net/sqlite-between/
// Limits classes to a numeric level (e.g., 100-level) when requested.
function buildLevelFilter(level, otherFilters, params) {
  if (level !== "all") {
    level = parseInt(level);
    let levelCheckLine = "CAST(SUBSTR(course_id, LENGTH(department) + 1) AS INT)";
    otherFilters.push(`(${levelCheckLine} BETWEEN ? AND ?)`);
    params.push(level, level + 99);
  }
}

// Filters based on whether prerequisites exist or not.
function buildPrereqFilter(prereq, otherFilters) {
  if (prereq === "none") {
    otherFilters.push("(prerequisites = 'None')");
  } else if (prereq === "required") {
    otherFilters.push("(prerequisites != 'None')");
  }
}

// Chooses the ORDER BY clause, preferring score before title/level.
function buildSorting(sort, hasScore) {
  let sqlQuery = " ORDER BY ";
  if (hasScore) {
    sqlQuery += "sortScore DESC, ";
  }
  if (sort === "level") {
    sqlQuery += "CAST(SUBSTR(course_id, INSTR(course_id, ' ') + 1) AS INT) ASC";
  } else {
    sqlQuery += "title ASC";
  }
  return sqlQuery;
}

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map
// Gets all courses by status and user
async function getCoursesByStatus(db, userId, status) {
  let rows = await db.all(`
    SELECT course_id
    FROM user_courses
    WHERE user_id = ? AND status = ?
  `, [userId, status]);
  return rows.map(r => r.course_id);
}

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/includes
// checks shared classes between 2 arrays.
function getSharedClasses(arrayOne, arrayTwo) {
  let result = [];
  for (let i = 0; i < arrayOne.length; i++) {
    let cls = arrayOne[i];
    if (arrayTwo.includes(cls)) {
      result.push(cls);
    }
  }
  return result;
}

// https://coreui.io/blog/how-to-remove-element-from-javascript-array/#4-the-filter-method
// Finds reciprocal two-person swaps between offered and wanted courses.
async function findSwapMatches(db, currentUserId) {
  let currentUserWant = await getCoursesByStatus(db, currentUserId, STATUS_WANTED);
  let currentUserGive = await getCoursesByStatus(db, currentUserId, STATUS_GIVING);

  if (currentUserWant.length !== 0 && currentUserGive.length !== 0) {
    let otherUsers = await db.all(`
      SELECT DISTINCT user_id
      FROM user_courses
      WHERE user_id != ?
    `, [currentUserId]);

    for (let row of otherUsers) {
      let otherUserId = row.user_id;

      let otherUserWant = await getCoursesByStatus(db, otherUserId, STATUS_WANTED);
      let otherUserGive = await getCoursesByStatus(db, otherUserId, STATUS_GIVING);

      let userWantOverlap = getSharedClasses(currentUserWant, otherUserGive);
      let userGiveOverlap = getSharedClasses(currentUserGive, otherUserWant);

      while (userWantOverlap.length > 0 && userGiveOverlap.length > 0) {

        let courseTheyGive = userWantOverlap[0];
        let courseIGive = userGiveOverlap[0];

        currentUserWant = currentUserWant.filter(c => c !== courseTheyGive);
        currentUserGive = currentUserGive.filter(c => c !== courseIGive);

        otherUserGive = otherUserGive.filter(c => c !== courseTheyGive);
        otherUserWant = otherUserWant.filter(c => c !== courseIGive);

        await createSwapRecord(db, currentUserId, otherUserId, courseIGive, courseTheyGive);
        await applySwap(db, currentUserId, otherUserId, courseIGive, courseTheyGive);

        userWantOverlap = getSharedClasses(currentUserWant, otherUserGive);
        userGiveOverlap = getSharedClasses(currentUserGive, otherUserWant);
      }
    }
  }
}

// Updates the profile
async function applySwap(db, currentUserId, otherUserId, courseUserGives, courseOtherUserGives) {
  await db.run(`
    DELETE FROM user_courses
    WHERE user_id = ? AND course_id = ? AND status = ?
  `, [currentUserId, courseUserGives, STATUS_GIVING]);

  await db.run(`
    DELETE FROM user_courses
    WHERE user_id = ? AND course_id = ? AND status = ?
  `, [currentUserId, courseOtherUserGives, STATUS_WANTED]);

  await db.run(`
    DELETE FROM user_courses
    WHERE user_id = ? AND course_id = ? AND status = ?
  `, [otherUserId, courseOtherUserGives, STATUS_GIVING]);

  await db.run(`
    DELETE FROM user_courses
    WHERE user_id = ? AND course_id = ? AND status = ?
  `, [otherUserId, courseUserGives, STATUS_WANTED]);

  await db.run(`
    INSERT INTO user_courses (user_id, course_id, status)
    VALUES (?, ?, ?)
  `, [currentUserId, courseOtherUserGives, STATUS_TAKING]);

  await db.run(`
    DELETE FROM user_courses
    WHERE user_id = ? AND course_id = ? AND status = ?
  `, [currentUserId, courseUserGives, STATUS_TAKING]);

  await db.run(`
    INSERT INTO user_courses (user_id, course_id, status)
    VALUES (?, ?, ?)
  `, [otherUserId, courseUserGives, STATUS_TAKING]);

  await db.run(`
    DELETE FROM user_courses
    WHERE user_id = ? AND course_id = ? AND status = ?
  `, [otherUserId, courseOtherUserGives, STATUS_TAKING]);
}

// Creates a new swap
async function createSwapRecord(db, user1Id, user2Id, course1, course2) {
  let course1Row = await db.get(`
    SELECT course_id
    FROM courses
    WHERE id = ?
  `, [course1]);
  let course2Row = await db.get(`
    SELECT course_id
    FROM courses
    WHERE id = ?
  `, [course2]);
  await db.run(`
    INSERT INTO swaps (user1_id, user2_id, user1_course, user2_course, status)
    VALUES (?, ?, ?, ?, 'success')
  `, [user1Id, user2Id, course1Row.course_id, course2Row.course_id]);
}

if (require.main === module) {
  const PORT = process.env.PORT || 8000;
  app.listen(PORT, '127.0.0.1', () => {
    console.log(`U-Swap is running at http://localhost:${PORT}`);
  });
}

module.exports = app;
