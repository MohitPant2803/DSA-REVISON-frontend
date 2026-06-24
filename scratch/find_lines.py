filepath = r"c:\Users\Mohit\Desktop\DSA Reels\dsa-rev-front\app\(protected)\(tabs)\reels.tsx"
with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

for idx, line in enumerate(lines):
    if 'useThemePalette' in line:
        print(f"{idx+1}: {line.strip()}")
