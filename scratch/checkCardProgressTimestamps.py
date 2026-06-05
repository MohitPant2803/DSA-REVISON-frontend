import sqlite3

def run():
    conn = sqlite3.connect('dsa_reels.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    userId = '6a208b4de0192e70b4fbd185'
    
    # 1. Print card_progress records for easy cards
    print("=== card_progress easy cards in SQLite ===")
    progress = cursor.execute("SELECT cardId, difficultyState, updatedAt FROM card_progress WHERE userId = ? AND difficultyState = 'easy';", [userId]).fetchall()
    for p in progress:
        print(f"Progress: CardId={p['cardId']}, State={p['difficultyState']}, ProgressUpdatedAt={p['updatedAt']}")
        
        # Check corresponding cards_metadata record
        meta = cursor.execute("SELECT title, updatedAt FROM cards_metadata WHERE id = ?;", [p['cardId']]).fetchone()
        if meta:
            print(f"  Metadata: Title={meta['title']}, MetadataUpdatedAt={meta['updatedAt']}")
        else:
            print(f"  Metadata: NOT FOUND")

if __name__ == '__main__':
    run()
