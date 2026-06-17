import json

with open('src/constants/offlineSeed.json', 'r', encoding='utf-8') as f:
    seed = json.load(f)

cards = seed.get('revisionCards', [])
print("Total cards:", len(cards))
if cards:
    print("Card fields:", list(cards[0].keys()))
    # Let's search if any card contains 6a1 in any field
    for c in cards:
        c_str = str(c)
        if "6a1" in c_str:
            print("Found 6a1 in card:", c['title'])
            for k, v in c.items():
                if "6a1" in str(v):
                    print(f"  Field {k}: {v}")
            break
