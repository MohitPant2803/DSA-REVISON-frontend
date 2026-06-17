import sqlite3
import sys

conn = sqlite3.connect('RKStorage.db')
cursor = conn.cursor()

cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
tables = [row[0] for row in cursor.fetchall()]

sys.stdout.reconfigure(encoding='utf-8')

for table in tables:
    try:
        cursor.execute(f"SELECT * FROM {table};")
        rows = cursor.fetchall()
        for r in rows:
            r_str = str(r)
            if "6a16ee5a" in r_str or "6a1655" in r_str:
                print(f"FOUND in table {table}:")
                # Print key/value specifically
                if len(r) >= 2:
                    print("  Key:", r[0])
                    # Print first 200 chars of value
                    print("  Value:", str(r[1])[:200])
    except Exception as e:
        print(f"Error reading {table}:", e)
