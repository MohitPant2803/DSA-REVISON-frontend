import subprocess

res = subprocess.run(["git", "diff", "app/(protected)/(tabs)/reels.tsx"], capture_output=True, cwd=r"c:\Users\Mohit\Desktop\DSA Reels\dsa-rev-front")
print(res.stdout.decode('utf-8', errors='ignore')[:5000]) # Print first 5000 chars of diff
