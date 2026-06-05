import sqlite3

def run():
    conn = sqlite3.connect('dsa_reels.db')
    cursor = conn.cursor()
    
    # Get user IDs and counts from card_progress
    rows = cursor.execute("SELECT userId, COUNT(*), COUNT(CASE WHEN difficultyState='easy' THEN 1 END) FROM card_progress GROUP BY userId;").fetchall()
    print("=== card_progress USER DISTRIBUTION IN SQLite ===")
    for row in rows:
        print(f"UserId: {row[0]}, Total Rows: {row[1]}, Easy Rows: {row[2]}")
        
    # Check if there are other users in reel_sessions
    sessions = cursor.execute("SELECT userId FROM reel_sessions;").fetchall()
    print("\n=== reel_sessions USERS ===")
    for s in sessions:
        print(s[0])

if __name__ == '__main__':
    run()
