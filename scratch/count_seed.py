import json

def run():
    print("=== READING offlineSeed.json ===")
    try:
        with open('src/constants/offlineSeed.json', 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        folders = data.get('folders', [])
        playlists = data.get('playlists', [])
        revision_cards = data.get('revisionCards', [])
        
        print(f"Folders count: {len(folders)}")
        print(f"Playlists count: {len(playlists)}")
        print(f"Revision cards count: {len(revision_cards)}")
        
    except Exception as e:
        print("Error reading seed file:", e)

if __name__ == '__main__':
    run()
