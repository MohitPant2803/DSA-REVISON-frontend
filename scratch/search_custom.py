import os

search_dir = "src"
for root, dirs, files in os.walk(search_dir):
    for file in files:
        if file.endswith(".ts") or file.endswith(".tsx"):
            path = os.path.join(root, file)
            with open(path, "r", encoding="utf-8", errors="ignore") as f:
                for i, line in enumerate(f):
                    if "type:" in line and "custom" in line:
                        print(f"{path} : Line {i+1} : {line.strip()}")
