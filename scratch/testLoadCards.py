import sqlite3

def run():
    conn = sqlite3.connect('dsa_reels.db')
    cursor = conn.cursor()
    
    userId = '6a208b4de0192e70b4fbd185'
    
    # Get difficultyState distribution
    rows = cursor.execute("SELECT difficultyState, COUNT(*) FROM card_progress WHERE userId = ? GROUP BY difficultyState;", [userId]).fetchall()
    print("=== difficultyState DISTRIBUTION IN SQLite ===")
    for row in rows:
        print(f"DifficultyState: {row[0]}, Count: {row[1]}")
        
    # Let's verify how many have difficultyState = 'easy' but are NOT in the database with that user ID
    # Wait, let's print all 5 easy cards with their contents
    easy_cards = cursor.execute("SELECT cardId, difficultyState, seenInReels, completed, revisionCount FROM card_progress WHERE userId = ? AND difficultyState = 'easy';", [userId]).fetchall()
    print("\n=== EASY CARDS DETAILS ===")
    for c in easy_cards:
        print(c)

if __name__ == '__main__':
    run()
