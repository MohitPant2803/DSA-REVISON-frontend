import sqlite3

def run():
    conn = sqlite3.connect('dsa_reels.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Get the 5 easy cards
    easy_progress = cursor.execute("SELECT cardId, difficultyState, userId FROM card_progress WHERE difficultyState='easy';").fetchall()
    
    print("=== CARD INTEGRITY CHECK ===")
    for prog in easy_progress:
        card_id = prog['cardId']
        # Check if it exists in cards_metadata
        meta = cursor.execute("SELECT id, title, isDeleted FROM cards_metadata WHERE id = ?;", [card_id]).fetchone()
        
        if meta:
            print(f"Card {card_id}:")
            print(f"  - Title: {meta['title']}")
            print(f"  - isDeleted in sqlite metadata: {meta['isDeleted']}")
        else:
            print(f"Card {card_id}: NOT FOUND in cards_metadata!")
            
    # Check total cards count in cards_metadata
    total_meta = cursor.execute("SELECT COUNT(*) FROM cards_metadata;").fetchone()[0]
    print(f"\nTotal cards in cards_metadata: {total_meta}")
    
    # Check if there are any deleted cards
    deleted_meta = cursor.execute("SELECT COUNT(*) FROM cards_metadata WHERE isDeleted = 1;").fetchone()[0]
    print(f"Deleted cards in cards_metadata: {deleted_meta}")

if __name__ == '__main__':
    run()
