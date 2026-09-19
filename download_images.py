import urllib.request
import os

os.makedirs('public/images/schedule', exist_ok=True)

# Unsplash IDs carefully selected for dark, atmospheric, premium cultural/architectural/abstract vibes
images = [
    "Q1p7bh3SHj8", # Dark elegant manuscript / book
    "M62NR2G5Fuw", # Minimal architectural arch, dark mood
    "nF8xhlmB-0c", # Abstract stage/blue lighting
    "XoGgG3zQ5bQ", # Dark microphone/podium
    "Sj0iMtq_Z4w", # Geometric/abstract dark pattern
    "3j46mDbn1oI", # Abstract texture/calligraphy feel
    "pUhxoSapPOA", # Books / library
    "x51Y0Xq97G4", # Minimal architectural detail
    "3w-UaX1f8pM", # Abstract blue light
    "W-d52lqf80Q"  # Elegant artistic still life
]

# We will use high quality dimensions, darkened slightly via UI CSS
for i, img_id in enumerate(images):
    url = f"https://source.unsplash.com/{img_id}/800x1200" # source.unsplash.com is deprecated, better to use direct urls if possible, but let's try it or images.unsplash.com
    # Actually source.unsplash.com is deprecated and redirects to generic images now.
    # Let's use direct urls with specific IDs via images.unsplash.com
    url = f"https://images.unsplash.com/photo-{img_id}?auto=format&fit=crop&w=800&q=80"
    
    filename = f"public/images/schedule/bg-{i+1}.jpg"
    print(f"Downloading {filename}...")
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response, open(filename, 'wb') as out_file:
            data = response.read()
            out_file.write(data)
    except Exception as e:
        print(f"Failed to download {img_id}: {e}")

print("Done")
