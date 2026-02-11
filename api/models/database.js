/**
 * Database Models - SQLite
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = process.env.CLAWJUDGE_DB || path.join(__dirname, '../../data/clawjudge.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let db = null;

/**
 * Initialize database connection and tables
 */
async function initializeDatabase() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        reject(err);
        return;
      }
      
      console.log('Connected to SQLite database');
      createTables().then(resolve).catch(reject);
    });
  });
}

/**
 * Create database tables
 */
async function createTables() {
  const tables = [
    // Verifications table
    `CREATE TABLE IF NOT EXISTS verifications (
      id TEXT PRIMARY KEY,
      submission_url TEXT,
      submission_type TEXT,
      requirements TEXT,
      language TEXT,
      verdict TEXT,
      score INTEGER,
      checks TEXT,
      reasoning TEXT,
      recommendation TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME
    )`,
    
    // Bounties table
    `CREATE TABLE IF NOT EXISTS bounties (
      id TEXT PRIMARY KEY,
      title TEXT,
      description TEXT,
      requirements TEXT,
      reward_amount REAL,
      reward_token TEXT,
      poster_address TEXT,
      status TEXT DEFAULT 'open',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      deadline DATETIME
    )`,
    
    // Bounty submissions table
    `CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY,
      bounty_id TEXT,
      worker_address TEXT,
      submission_url TEXT,
      submission_type TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (bounty_id) REFERENCES bounties(id)
    )`,
    
    // Judges table
    `CREATE TABLE IF NOT EXISTS judges (
      id TEXT PRIMARY KEY,
      address TEXT UNIQUE,
      name TEXT,
      reputation_score INTEGER DEFAULT 500,
      total_verdicts INTEGER DEFAULT 0,
      correct_verdicts INTEGER DEFAULT 0,
      stake_amount REAL DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_active DATETIME
    )`,
    
    // Verdicts table (judge verdicts on bounties)
    `CREATE TABLE IF NOT EXISTS verdicts (
      id TEXT PRIMARY KEY,
      submission_id TEXT,
      judge_id TEXT,
      verdict TEXT,
      score INTEGER,
      checks TEXT,
      qualitative TEXT,
      reasoning TEXT,
      recommendation TEXT,
      status TEXT DEFAULT 'submitted',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (submission_id) REFERENCES submissions(id),
      FOREIGN KEY (judge_id) REFERENCES judges(id)
    )`,
    
    // Webhooks table
    `CREATE TABLE IF NOT EXISTS webhooks (
      id TEXT PRIMARY KEY,
      url TEXT,
      event_types TEXT,
      secret TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
  ];
  
  for (const sql of tables) {
    await new Promise((resolve, reject) => {
      db.run(sql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
  
  console.log('Database tables created');
}

/**
 * Get database instance
 */
function getDb() {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
}

/**
 * Verification model
 */
const Verification = {
  async create(data) {
    const id = uuidv4();
    const sql = `INSERT INTO verifications 
      (id, submission_url, submission_type, requirements, language, status) 
      VALUES (?, ?, ?, ?, ?, ?)`;
    
    return new Promise((resolve, reject) => {
      db.run(sql, [
        id,
        data.submission_url,
        data.submission_type,
        JSON.stringify(data.requirements || []),
        data.language,
        'pending'
      ], function(err) {
        if (err) reject(err);
        else resolve(id);
      });
    });
  },
  
  async update(id, data) {
    const fields = [];
    const values = [];
    
    for (const [key, value] of Object.entries(data)) {
      if (key === 'checks' || key === 'requirements') {
        fields.push(`${key} = ?`);
        values.push(JSON.stringify(value));
      } else {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }
    
    values.push(id);
    const sql = `UPDATE verifications SET ${fields.join(', ')} WHERE id = ?`;
    
    return new Promise((resolve, reject) => {
      db.run(sql, values, function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  },
  
  async getById(id) {
    const sql = 'SELECT * FROM verifications WHERE id = ?';
    
    return new Promise((resolve, reject) => {
      db.get(sql, [id], (err, row) => {
        if (err) reject(err);
        else {
          if (row) {
            row.requirements = JSON.parse(row.requirements || '[]');
            row.checks = JSON.parse(row.checks || '{}');
          }
          resolve(row);
        }
      });
    });
  }
};

/**
 * Bounty model
 */
const Bounty = {
  async create(data) {
    const id = uuidv4();
    const sql = `INSERT INTO bounties 
      (id, title, description, requirements, reward_amount, reward_token, poster_address, deadline)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    
    return new Promise((resolve, reject) => {
      db.run(sql, [
        id,
        data.title,
        data.description,
        JSON.stringify(data.requirements || []),
        data.reward_amount,
        data.reward_token,
        data.poster_address,
        data.deadline
      ], function(err) {
        if (err) reject(err);
        else resolve(id);
      });
    });
  },
  
  async getById(id) {
    const sql = 'SELECT * FROM bounties WHERE id = ?';
    
    return new Promise((resolve, reject) => {
      db.get(sql, [id], (err, row) => {
        if (err) reject(err);
        else {
          if (row) {
            row.requirements = JSON.parse(row.requirements || '[]');
          }
          resolve(row);
        }
      });
    });
  },
  
  async list(limit = 50, offset = 0) {
    const sql = 'SELECT * FROM bounties ORDER BY created_at DESC LIMIT ? OFFSET ?';
    
    return new Promise((resolve, reject) => {
      db.all(sql, [limit, offset], (err, rows) => {
        if (err) reject(err);
        else {
          rows.forEach(row => {
            row.requirements = JSON.parse(row.requirements || '[]');
          });
          resolve(rows);
        }
      });
    });
  }
};

/**
 * Submission model
 */
const Submission = {
  async create(data) {
    const id = uuidv4();
    const sql = `INSERT INTO submissions 
      (id, bounty_id, worker_address, submission_url, submission_type)
      VALUES (?, ?, ?, ?, ?)`;
    
    return new Promise((resolve, reject) => {
      db.run(sql, [
        id,
        data.bounty_id,
        data.worker_address,
        data.submission_url,
        data.submission_type
      ], function(err) {
        if (err) reject(err);
        else resolve(id);
      });
    });
  },
  
  async getByBountyId(bountyId) {
    const sql = 'SELECT * FROM submissions WHERE bounty_id = ? ORDER BY created_at DESC';
    
    return new Promise((resolve, reject) => {
      db.all(sql, [bountyId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
};

/**
 * Judge model
 */
const Judge = {
  async create(data) {
    const id = uuidv4();
    const sql = `INSERT INTO judges 
      (id, address, name, stake_amount)
      VALUES (?, ?, ?, ?)`;
    
    return new Promise((resolve, reject) => {
      db.run(sql, [
        id,
        data.address,
        data.name,
        data.stake_amount || 0
      ], function(err) {
        if (err) reject(err);
        else resolve(id);
      });
    });
  },
  
  async getByAddress(address) {
    const sql = 'SELECT * FROM judges WHERE address = ?';
    
    return new Promise((resolve, reject) => {
      db.get(sql, [address], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },
  
  async list(limit = 50, offset = 0) {
    const sql = `SELECT * FROM judges WHERE is_active = 1 
      ORDER BY reputation_score DESC LIMIT ? OFFSET ?`;
    
    return new Promise((resolve, reject) => {
      db.all(sql, [limit, offset], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },
  
  async updateStats(id, isCorrect) {
    const sql = `UPDATE judges SET 
      total_verdicts = total_verdicts + 1,
      correct_verdicts = correct_verdicts + ?,
      last_active = CURRENT_TIMESTAMP
      WHERE id = ?`;
    
    return new Promise((resolve, reject) => {
      db.run(sql, [isCorrect ? 1 : 0, id], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }
};

/**
 * Verdict model
 */
const Verdict = {
  async create(data) {
    const id = uuidv4();
    const sql = `INSERT INTO verdicts 
      (id, submission_id, judge_id, verdict, score, checks, qualitative, reasoning, recommendation)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    
    return new Promise((resolve, reject) => {
      db.run(sql, [
        id,
        data.submission_id,
        data.judge_id,
        data.verdict,
        data.score,
        JSON.stringify(data.checks || {}),
        JSON.stringify(data.qualitative || {}),
        data.reasoning,
        data.recommendation
      ], function(err) {
        if (err) reject(err);
        else resolve(id);
      });
    });
  },
  
  async getBySubmissionId(submissionId) {
    const sql = `SELECT v.*, j.name as judge_name, j.address as judge_address 
      FROM verdicts v 
      JOIN judges j ON v.judge_id = j.id 
      WHERE v.submission_id = ?`;
    
    return new Promise((resolve, reject) => {
      db.all(sql, [submissionId], (err, rows) => {
        if (err) reject(err);
        else {
          rows.forEach(row => {
            row.checks = JSON.parse(row.checks || '{}');
            row.qualitative = JSON.parse(row.qualitative || '{}');
          });
          resolve(rows);
        }
      });
    });
  }
};

module.exports = {
  initializeDatabase,
  getDb,
  Verification,
  Bounty,
  Submission,
  Judge,
  Verdict
};
