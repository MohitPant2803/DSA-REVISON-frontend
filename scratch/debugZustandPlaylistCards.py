import sqlite3
import json

def resolveCardState(card, cardDifficultyMap):
    if not card:
        return card
    cleanId = card['_id'].split('-loop-')[0]
    local = cardDifficultyMap.get(cleanId)
    
    if local is not None:
        localDifficulty = local.get('difficulty')
        return {
            **card,
            'difficultyState': localDifficulty
        }
    return card

def run():
    conn = sqlite3.connect('RKStorage.db')
    cursor = conn.cursor()
    rows = cursor.execute("SELECT key, value FROM catalystLocalStorage;").fetchall()
    
    state = None
    for row in rows:
        key = row[0]
        if "dsa-playlist-state" in key:
            state = json.loads(row[1]).get("state", {})
            break
            
    if not state:
        print("Error: Zustand state not found in RKStorage!")
        return
        
    cardDifficultyMap = state.get("cardDifficultyMap", {})
    cardsById = state.get("cardsById", {})
    
    print(f"Zustand state holds:")
    print(f"  - cardsById count: {len(cardsById)}")
    print(f"  - cardDifficultyMap count: {len(cardDifficultyMap)}")
    
    # Let's run the selector filter in Python
    # But wait! During runtime, cardsById is hydrated from SQLite, so let's load cardsById from SQLite
    # to emulate the runtime state!
    db_conn = sqlite3.connect('dsa_reels.db')
    db_conn.row_factory = sqlite3.Row
    db_cursor = db_conn.cursor()
    
    userId = '6a208b4de0192e70b4fbd185'
    progressRows = db_cursor.execute("SELECT * FROM card_progress WHERE userId = ?;", [userId]).fetchall()
    progressMap = {row['cardId']: dict(row) for row in progressRows}
    
    cardsMetaRows = db_cursor.execute("SELECT * FROM cards_metadata WHERE isDeleted = 0;").fetchall()
    
    emulated_cardsById = {}
    for row in cardsMetaRows:
        cid = row['id']
        prog = progressMap.get(cid)
        emulated_cardsById[cid] = {
            '_id': cid,
            'title': row['title'],
            'difficultyState': prog['difficultyState'] if prog else None,
            'isDeleted': row['isDeleted'] == 1
        }
        
    print(f"\nEmulated runtime cardsById count: {len(emulated_cardsById)}")
    
    # Run the selector
    resolved = []
    for cardId, card in emulated_cardsById.items():
        if card and not card.get('isDeleted'):
            resolved_card = resolveCardState(card, cardDifficultyMap)
            if resolved_card.get('difficultyState') == 'easy':
                resolved.append(resolved_card)
                
    print(f"\nSelector resolved 'easy' cards count: {len(resolved)}")
    for rc in resolved:
        print(f"  - ID: {rc['_id']}, Title: {rc['title']}, DifficultyState: {rc['difficultyState']}")

if __name__ == '__main__':
    run()
