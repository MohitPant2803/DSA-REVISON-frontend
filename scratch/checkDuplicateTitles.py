import sqlite3

def run():
    conn = sqlite3.connect('dsa_reels.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    target_titles = [
        "Reverse a Linked List",
        "Implement Trie (Prefix Tree)",
        "Populating Next Right Pointers",
        "Transmission_Media",
        "Number of people who wear spectacles in India"
    ]
    
    print("=== SEARCHING DUPLICATE TITLES IN DB ===")
    for title in target_titles:
        rows = cursor.execute("SELECT id, title, isDeleted, difficulty FROM cards_metadata WHERE LOWER(TRIM(title)) = LOWER(TRIM(?));", [title]).fetchall()
        print(f"\nTitle: '{title}' - Found {len(rows)} matching rows in cards_metadata:")
        for row in rows:
            print(f"  - CardId: {row['id']}, isDeleted: {row['isDeleted']}, Difficulty: {row['difficulty']}")
            
            # Check progress for this card
            prog = cursor.execute("SELECT difficultyState, userId FROM card_progress WHERE cardId = ?;", [row['id']]).fetchone()
            if prog:
                print(f"    * Progress: difficultyState={prog['difficultyState']}, User={prog['userId']}")
            else:
                print(f"    * Progress: None")

if __name__ == '__main__':
    run()
