import re

filepath = r"c:\Users\Mohit\Desktop\DSA Reels\dsa-rev-front\src\components\ConceptCardPreview.tsx"
with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

for idx, line in enumerate(lines):
    if 'function getSlidesForCard' in line or 'const getSlidesForCard' in line:
        print(f"{idx+1}: {line.strip()}")
        # print some lines after
        for k in range(1, 40):
            print(f"  {idx+1+k}: {lines[idx+k].strip()}")
