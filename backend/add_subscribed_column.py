import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'users.db')
if not os.path.exists(DB_PATH):
    print('DB file not found at', DB_PATH)
    raise SystemExit(1)

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()
# Check if column exists
cur.execute("PRAGMA table_info(user)")
cols = [r[1] for r in cur.fetchall()]
if 'subscribed' in cols:
    print('Column already present')
else:
    try:
        cur.execute("ALTER TABLE user ADD COLUMN subscribed BOOLEAN DEFAULT 0")
        conn.commit()
        print('Added subscribed column')
    except Exception as e:
        print('Failed to add column:', e)
        raise
conn.close()