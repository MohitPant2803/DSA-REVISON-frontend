import re

filepath = r"c:\Users\Mohit\Desktop\DSA Reels\dsa-rev-front\app\(protected)\(tabs)\learn.tsx"
with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

for idx, line in enumerate(lines):
    if 'segments' in line or 'Segments' in line:
        print(f"{idx+1}: {line.strip()}")
