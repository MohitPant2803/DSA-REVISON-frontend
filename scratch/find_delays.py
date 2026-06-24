import os

home_dir = r"C:\Users\Mohit"
search_paths = [
    os.path.join(home_dir, ".eas"),
    os.path.join(home_dir, ".expo"),
    os.path.join(home_dir, ".gemini"),
    home_dir
]

for path in search_paths:
    if not os.path.exists(path):
        continue
    print(f"Searching path: {path}")
    try:
        for file in os.listdir(path):
            file_path = os.path.join(path, file)
            if os.path.isfile(file_path) and file.endswith((".json", ".txt", ".properties", ".yml", ".yaml")):
                try:
                    with open(file_path, "r", encoding="utf-8") as f:
                        content = f.read()
                    if "password" in content.lower() or "alias" in content.lower() or "mohit_builds" in content.lower():
                        print(f"  Found potential file: {file_path}")
                        # Print non-sensitive lines or print keys
                        for line in content.splitlines():
                            if any(k in line.lower() for k in ["alias", "storefile", "keystore"]):
                                print(f"    {line.strip()}")
                except Exception:
                    pass
    except Exception as e:
        print(f"Error listing {path}: {e}")
