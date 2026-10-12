const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, 'game.db');
const db = new Database(dbPath);

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    started_at TEXT,
    ended_at TEXT,
    result TEXT
  );

  CREATE TABLE IF NOT EXISTS doors_config (
    session_id TEXT,
    door_label TEXT,
    status TEXT,
    FOREIGN KEY(session_id) REFERENCES sessions(id)
  );

  CREATE TABLE IF NOT EXISTS clues (
    session_id TEXT,
    row INTEGER,
    col INTEGER,
    description TEXT,
    FOREIGN KEY(session_id) REFERENCES sessions(id)
  );
`);

module.exports = db;
