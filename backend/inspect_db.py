import sqlite3, os
p = os.path.join(os.path.dirname(__file__), 'instance', 'data.db')
print('DB path:', p)
conn = sqlite3.connect(p)
cur = conn.cursor()
cur.execute('PRAGMA table_info(user)')
rows = cur.fetchall()
print('columns:', rows)
conn.close()
