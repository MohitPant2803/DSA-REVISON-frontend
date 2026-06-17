import sqlite3

def run():
    print("=== dsa_reels.db ===")
    try:
        conn = sqlite3.connect('dsa_reels.db')
        cur = conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [t[0] for t in cur.fetchall()]
        print("Tables:", tables)
        for t in tables:
            try:
                count = cur.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
                print(f"  - {t}: {count}")
            except Exception as e:
                print(f"  - {t}: Error: {e}")
        conn.close()
    except Exception as e:
        print("Error opening dsa_reels.db:", e)

if __name__ == '__main__':
    run()
