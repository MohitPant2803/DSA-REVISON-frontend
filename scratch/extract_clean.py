import os

files_to_dump = [
    ("app/_layout.tsx", "dsa-rev-front/app/_layout.tsx"),
    ("app/index.tsx", "dsa-rev-front/app/index.tsx"),
    ("app/(protected)/_layout.tsx", "dsa-rev-front/app/(protected)/_layout.tsx"),
    ("app/(auth)/_layout.tsx", "dsa-rev-front/app/(auth)/_layout.tsx"),
    ("app/(protected)/(tabs)/_layout.tsx", "dsa-rev-front/app/(protected)/(tabs)/_layout.tsx"),
    ("app/(protected)/(tabs)/learn.tsx", "dsa-rev-front/app/(protected)/(tabs)/learn.tsx"),
    ("app/(protected)/(tabs)/personal.tsx", "dsa-rev-front/app/(protected)/(tabs)/personal.tsx"),
    ("app/(protected)/(tabs)/reels.tsx", "dsa-rev-front/app/(protected)/(tabs)/reels.tsx"),
    ("src/hooks/useSyncEngine.ts", "dsa-rev-front/src/hooks/useSyncEngine.ts"),
    ("src/hooks/useAppBackHandler.ts", "dsa-rev-front/src/hooks/useAppBackHandler.ts"),
    ("src/hooks/usePlaylists.ts", "dsa-rev-front/src/hooks/usePlaylists.ts"),
    ("src/store/useAuthStore.ts", "dsa-rev-front/src/store/useAuthStore.ts"),
    ("src/store/usePlaylistStateStore.ts", "dsa-rev-front/src/store/usePlaylistStateStore.ts"),
    ("package.json", "dsa-rev-front/package.json"),
]

base_dir = r"c:\Users\Mohit\Desktop\DSA Reels"
output_file = os.path.join(base_dir, "dsa-rev-front", "scratch", "codebase_dump.txt")

os.makedirs(os.path.dirname(output_file), exist_ok=True)

with open(output_file, "w", encoding="utf-8") as out:
    for display_path, rel_path in files_to_dump:
        full_path = os.path.join(base_dir, rel_path)
        if os.path.exists(full_path):
            with open(full_path, "r", encoding="utf-8") as f:
                content = f.read()
            out.write(f"### FILE: {display_path}\n")
            out.write(content)
            out.write("\n\n")
        else:
            out.write(f"### FILE: {display_path}\n[FILE NOT FOUND: {full_path}]\n\n")

print(f"Dumped all files to {output_file}")
