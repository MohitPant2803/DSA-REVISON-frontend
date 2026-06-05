import sqlite3

def run():
    conn = sqlite3.connect('dsa_reels.db')
    cursor = conn.cursor()
    
    # Get user IDs and counts from playlists
    rows = cursor.execute("SELECT userId, COUNT(*) FROM playlists GROUP BY userId;").fetchall()
    print("=== playlists USER DISTRIBUTION IN SQLite ===")
    for row in rows:
        print(f"UserId: {row[0]}, Total Playlists: {row[1]}")
        
    # Print detail of all playlists in SQLite
    all_pls = cursor.execute("SELECT id, name, userId, isDeleted FROM playlists;").fetchall()
    print("\n=== ALL PLAYLISTS IN SQLITE ===")
    for p in all_pls:
        print(f"Playlist: ID={p[0]}, Name='{p[1]}', UserId={p[2]}, isDeleted={p[3]}")

if __name__ == '__main__':
    run()
