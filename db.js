// PTK Digital Platform SQLite database module
// Creates the database and required tables on first run.
// Database location can be overridden with the DB_PATH environment variable.

const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const defaultDataDir = path.join(__dirname, 'data');
const databasePath = process.env.DB_PATH || path.join(defaultDataDir, 'ptk.db');

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const db = new sqlite3.Database(databasePath);

function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (error) {
      if (error) return reject(error);
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function getRow(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) return reject(error);
      resolve(row || null);
    });
  });
}

function getAllRows(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) return reject(error);
      resolve(rows || []);
    });
  });
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

async function addAuditLog(action, details, recordType = 'system', recordId = '', actor = 'system') {
  return runQuery(
    `INSERT INTO audit_logs (actor, action, record_type, record_id, details, created_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    [String(actor || 'system'), String(action || ''), String(recordType || ''), String(recordId ?? ''), String(details || '')]
  );
}

async function getSettings() {
  const rows = await getAllRows('SELECT setting_key, setting_value FROM settings');
  return Object.fromEntries(rows.map(row => [row.setting_key, row.setting_value]));
}

async function initDatabase() {
  await runQuery('PRAGMA foreign_keys = ON');

  const schema = [
    `CREATE TABLE IF NOT EXISTS settings (
      setting_key TEXT PRIMARY KEY, setting_value TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS districts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS membership_applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      application_ref TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      tamil_name TEXT,
      phone TEXT NOT NULL,
      email TEXT,
      district TEXT NOT NULL,
      local_unit TEXT NOT NULL,
      address TEXT,
      membership_category TEXT NOT NULL,
      consent INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      review_note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      tamil_name TEXT,
      phone TEXT NOT NULL,
      email TEXT,
      district TEXT NOT NULL,
      local_unit TEXT NOT NULL,
      address TEXT,
      membership_category TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL,
      issue_date TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      revoked_at TEXT,
      generated_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(member_id) REFERENCES members(id)
    )`,
    `CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      published INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      location TEXT,
      event_date TEXT,
      published INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS volunteers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ref TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      district TEXT NOT NULL,
      interest TEXT NOT NULL,
      availability TEXT,
      message TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS grievances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ref TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      district TEXT,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS contact_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ref TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS finance_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_type TEXT,
      amount REAL NOT NULL DEFAULT 0,
      description TEXT,
      reference TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor TEXT NOT NULL DEFAULT 'system',
      action TEXT NOT NULL,
      record_type TEXT,
      record_id TEXT,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`
  ];

  for (const sql of schema) await runQuery(sql);

  const defaults = {
    party_name_tamil: 'புதியா தலைமுறை கழகம்',
    party_name_english: 'PTK - Puthiya Thalaimurai Kazhagam',
    tagline: 'மக்களுக்காக, மக்களுடன்',
    leader_name: '',
    leader_title: 'தலைவர்',
    contact_email: '',
    contact_phone: '',
    contact_address: '',
    card_red: '#A8202B',
    card_yellow: '#F2C744',
    card_green: '#16734B',
    about_text: '',
    mission_text: '',
    vision_text: '',
    privacy_policy: '',
    terms: ''
  };

  for (const [key, value] of Object.entries(defaults)) {
    await runQuery(
      'INSERT OR IGNORE INTO settings (setting_key, setting_value) VALUES (?, ?)',
      [key, value]
    );
  }

  const districtNames = [
    'Ariyalur', 'Chengalpattu', 'Chennai', 'Coimbatore', 'Cuddalore',
    'Dharmapuri', 'Dindigul', 'Erode', 'Kallakurichi', 'Kancheepuram',
    'Karur', 'Krishnagiri', 'Madurai', 'Mayiladuthurai', 'Nagapattinam',
    'Kanniyakumari', 'Namakkal', 'Perambalur', 'Pudukkottai', 'Ramanathapuram',
    'Ranipet', 'Salem', 'Sivaganga', 'Tenkasi', 'Thanjavur', 'Theni',
    'Thoothukudi', 'Tiruchirappalli', 'Tirunelveli', 'Tirupathur',
    'Tiruppur', 'Tiruvallur', 'Tiruvannamalai', 'Tiruvarur', 'Vellore',
    'Viluppuram', 'Virudhunagar', 'The Nilgiris', 'Tirupattur'
  ];
  for (const name of districtNames) {
    await runQuery('INSERT OR IGNORE INTO districts (name) VALUES (?)', [name]);
  }

  // Seed the documented first-run admin only when no admin user exists.
  // Change this password immediately after the first login.
  const existingAdmin = await getRow('SELECT id FROM users WHERE username = ?', ['admin']);
  if (!existingAdmin) {
    const passwordHash = bcrypt.hashSync('admin123', 10);
    await runQuery(
      'INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, datetime("now"))',
      ['admin', passwordHash, 'admin']
    );
  }

  console.log(`PTK database ready: ${databasePath}`);
}

module.exports = {
  db,
  initDatabase,
  getSettings,
  getAllRows,
  getRow,
  runQuery,
  csvEscape,
  addAuditLog
};
