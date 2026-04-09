const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Store the database file in the project folder
const dbPath = path.resolve(__dirname, 'hospital.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    console.log('Connected to the SQLite database.');

    // Create the users table
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE,
      password TEXT,
      role TEXT,
      department TEXT
    )`);

    // Create the patients table with user_id
    db.run(`CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      name TEXT,
      age INTEGER,
      painLevel INTEGER,
      complaint TEXT,
      department TEXT,
      status TEXT,
      priorityScore INTEGER,
      createdAt INTEGER
    )`);

    // Ensure user_id column exists for migrants
    db.run(`ALTER TABLE patients ADD COLUMN user_id TEXT`, (err) => { 
        // ignore error if column already exists
    });
  }
});

module.exports = {
  db,

  // USER MANAGEMENT
  addUser: (user, callback) => {
    const { id, username, password, role, department } = user;
    db.run(`INSERT INTO users (id, username, password, role, department) VALUES (?, ?, ?, ?, ?)`,
      [id, username, password, role, department], function(err) {
        callback(err, this);
      });
  },

  findUser: (username, callback) => {
    db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, row) => {
      callback(err, row);
    });
  },

  addPatient: (patient, callback) => {
    const { id, user_id, name, age, painLevel, complaint, department, priorityScore, createdAt } = patient;
    const stmt = db.prepare(`INSERT INTO patients (id, user_id, name, age, painLevel, complaint, department, status, priorityScore, createdAt) 
                             VALUES (?, ?, ?, ?, ?, ?, ?, 'waiting', ?, ?)`);
    stmt.run([id, user_id, name || 'Anonymous', age || 30, painLevel || 0, complaint, department, priorityScore || 0, createdAt || Date.now()], function (err) {
      callback(err, this);
    });
  },

  getQueueForDepartment: (department, callback) => {
    db.all(`SELECT * FROM patients WHERE department = ? AND status = 'waiting' ORDER BY priorityScore DESC, createdAt ASC`, [department], (err, rows) => {
      callback(err, rows);
    });
  },

  getAllQueues: (callback) => {
    db.all(`SELECT * FROM patients WHERE status = 'waiting' ORDER BY priorityScore DESC, createdAt ASC`, [], (err, rows) => {
      if (err) return callback(err);

      const queues = {};
      rows.forEach(p => {
        if (!queues[p.department]) queues[p.department] = [];
        queues[p.department].push(p);
      });
      callback(null, queues);
    });
  },

  getQueueCounts: (callback) => {
    db.all(`SELECT department, COUNT(*) as count FROM patients WHERE status = 'waiting' GROUP BY department`, [], (err, rows) => {
      if (err) return callback(err);

      const counts = {};
      rows.forEach(r => counts[r.department] = r.count);
      callback(null, counts);
    });
  },

  completePatient: (id, callback) => {
    db.run(`UPDATE patients SET status = 'completed' WHERE id = ?`, [id], function (err) {
      callback(err, this);
    });
  },

  clearQueues: (callback) => {
    db.run(`DELETE FROM patients WHERE status = 'waiting'`, [], function (err) {
      if (callback) callback(err);
    });
  },

  getHistory: (user_id, callback) => {
    db.all(`SELECT * FROM patients WHERE user_id = ? AND status = 'completed' ORDER BY createdAt DESC`, [user_id], (err, rows) => {
      callback(err, rows);
    });
  },

  getAllStaff: (callback) => {
    db.all(`SELECT id, username, role, department FROM users WHERE role IN ('doctor', 'admin')`, [], (err, rows) => {
      callback(err, rows);
    });
  }
};
