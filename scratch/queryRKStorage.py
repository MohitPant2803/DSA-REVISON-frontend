import sqlite3
import json

def run():
    conn = sqlite3.connect('RKStorage.db')
    cursor = conn.cursor()
    
    # 1. Print tables
    tables = cursor.execute("SELECT name FROM sqlite_master WHERE type='table';").fetchall()
    print("=== RKStorage TABLES ===")
    print([t[0] for t in tables])
    
    # 2. Get keys
    rows = cursor.execute("SELECT key, value FROM catalystLocalStorage;").fetchall()
    print("\n=== catalystLocalStorage Keys ===")
    for row in rows:
        key = row[0]
        val = row[1]
        print(f"Key: {key} | Value size: {len(val)}")
        if "playlist" in key or "auth" in key or "reels" in key:
            print(f"  First 200 chars: {val[:200]}")
            
    # 3. Parse and print usePlaylistStateStore state keys
    for row in rows:
        key = row[0]
        if "playlist-state-store" in key or "dsa-revision-app" in key or "playlist" in key:
            try:
                # Value is stored as string in sqlite
                parsed = json.loads(row[1])
                state = parsed.get("state", {})
                print("\n=== ZUSTAND PLAYLIST STATE KEYS ===")
                print(list(state.keys()))
                
                # Check initialSmartCounts
                print("\ninitialSmartCounts in Zustand:")
                print(state.get("initialSmartCounts"))
                
                # Check smartPlaylistDeltaCounts
                print("smartPlaylistDeltaCounts in Zustand:")
                print(state.get("smartPlaylistDeltaCounts"))
                
                # Check how many cards are in cardsById
                cards = state.get("cardsById", {})
                print(f"\ncardsById length in Zustand: {len(cards)}")
                
                # Let's count how many have difficultyState === 'easy'
                easy_cards = []
                for cid, c in cards.items():
                    if c.get("difficultyState") == "easy":
                        easy_cards.append((cid, c.get("title")))
                print(f"Cards in cardsById with difficultyState === 'easy' ({len(easy_cards)}):")
                for ec in easy_cards:
                    print(f"  - ID: {ec[0]}, Title: {ec[1]}")
                    
                # Check cardDifficultyMap
                diff_map = state.get("cardDifficultyMap", {})
                print(f"\ncardDifficultyMap length in Zustand: {len(diff_map)}")
                easy_in_map = []
                for cid, entry in diff_map.items():
                    if entry.get("difficulty") == "easy":
                        easy_in_map.append((cid, entry))
                print(f"Entries in cardDifficultyMap with difficulty === 'easy' ({len(easy_in_map)}):")
                for em in easy_in_map:
                    print(f"  - ID: {em[0]}, Entry: {em[1]}")
                    
            except Exception as e:
                print(f"Error parsing key {key}: {e}")

if __name__ == '__main__':
    run()
