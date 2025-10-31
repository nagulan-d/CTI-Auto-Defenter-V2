import sqlite3, os
p = os.path.join(os.path.dirname(__file__), 'instance', 'data.db')
print('DB path:', p)
if not os.path.exists(p):
    print('DB not found')
    raise SystemExit(1)
conn = sqlite3.connect(p)
cur = conn.cursor()
cur.execute("PRAGMA table_info(user)")
cols = [r[1] for r in cur.fetchall()]
print('before cols:', cols)
if 'subscribed' in cols:
    print('already present')
else:
    cur.execute("ALTER TABLE user ADD COLUMN subscribed BOOLEAN DEFAULT 0")
    conn.commit()
    print('added subscribed')
cur.execute("PRAGMA table_info(user)")
print('after cols:', [r[1] for r in cur.fetchall()])
conn.close()
