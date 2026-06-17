import sqlite3

conn = sqlite3.connect('dsa_reels.db')
cursor = conn.cursor()

# Get tables
cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
print("Tables:", cursor.fetchall())

# Query folders
cursor.execute("SELECT id, title FROM folders LIMIT 10;")
print("\nFolders:", cursor.fetchall())

# Query cards_metadata
cursor.execute("SELECT id, title, folderId FROM cards_metadata LIMIT 10;")
print("\nCards Metadata:", cursor.fetchall())

# Query playlists
cursor.execute("SELECT id, name, cardIds FROM playlists LIMIT 10;")
print("\nPlaylists:", cursor.fetchall())
