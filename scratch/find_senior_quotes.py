import os
import re

root_dir = r"c:\Users\Mohit\Desktop\DSA Reels\dsa-rev-front"
pattern = re.compile(r"seniorQuotes", re.IGNORECASE)

for root, dirs, files in os.walk(root_dir):
    if "node_modules" in root or ".git" in root or ".expo" in root:
        continue
    for file in files:
        if file.endswith((".ts", ".tsx", ".js", ".jsx", ".json")):
            file_path = os.path.join(root, file)
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    content = f.read()
                if pattern.search(content):
                    print(file_path)
            except Exception:
                pass
