import os
import sqlite3


FOLDER = os.path.dirname(os.path.abspath(__file__))
DATABASE = os.path.join(FOLDER, "attendance.db")


def get_connection():
    db = sqlite3.connect(DATABASE)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    return db


def init_database():
    db = get_connection()
    try:
        db.execute("""
            CREATE TABLE IF NOT EXISTS subjects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE COLLATE NOCASE,
                code TEXT UNIQUE COLLATE NOCASE
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS attendance (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                subject_id INTEGER NOT NULL,
                date TEXT NOT NULL,
                status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'leave')),
                FOREIGN KEY (subject_id) REFERENCES subjects (id) ON DELETE CASCADE,
                UNIQUE (subject_id, date)
            )
        """)
        db.commit()
    finally:
        db.close()


def fetch_all(sql, params=()):
    db = get_connection()
    try:
        data = db.execute(sql, params).fetchall()
        rows = []
        for row in data:
            rows.append(dict(row))
        return rows
    finally:
        db.close()


def fetch_one(sql, params=()):
    rows = fetch_all(sql, params)
    if len(rows) == 0:
        return None
    return rows[0]


def run_in_transaction(statements):
    db = get_connection()
    count = 0
    try:
        for sql, params in statements:
            result = db.execute(sql, params)
            count += result.rowcount
        db.commit()
    except sqlite3.Error:
        db.rollback()
        raise
    finally:
        db.close()
    return count
