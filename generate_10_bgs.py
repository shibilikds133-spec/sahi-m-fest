from PIL import Image, ImageEnhance, ImageFilter
import os
import glob

os.makedirs('public/images/schedule', exist_ok=True)

# Find generated images
images = glob.glob(r'C:\Users\Admin\.gemini\antigravity\brain\a74b5e36-3c2e-404e-86e0-8cb0aecfa4f6\schedule_bg_*.jpg')
if not images:
    print('No base images found!')
    exit(1)

bases = [Image.open(img).convert('RGB') for img in images]

# We need 10 images
# Image 1: Base 0 (Book)
# Image 2: Base 1 (Arch)
# Image 3: Base 2 (Mic)
# Image 4: Base 0, zoomed and darkened
# Image 5: Base 1, flipped horizontally, slightly blurred
# Image 6: Base 2, contrast enhanced, cropped
# Image 7: Base 0, color shifted (using channel swap)
# Image 8: Base 1, zoomed, rotated slightly
# Image 9: Base 2, flipped horizontally, darker
# Image 10: Base 0, flipped, heavily blurred background effect

def save_img(img, index):
    path = f'public/images/schedule/bg-{index}.jpg'
    img = img.resize((800, 800), Image.Resampling.LANCZOS)
    img.save(path, quality=85)
    print(f'Saved {path}')

# 1
save_img(bases[0], 1)
# 2
save_img(bases[1], 2)
# 3
save_img(bases[2], 3)
# 4
img4 = bases[0].crop((100, 100, 900, 900))
img4 = ImageEnhance.Brightness(img4).enhance(0.8)
save_img(img4, 4)
# 5
img5 = bases[1].transpose(Image.Transpose.FLIP_LEFT_RIGHT)
img5 = img5.filter(ImageFilter.GaussianBlur(radius=2))
save_img(img5, 5)
# 6
img6 = bases[2].crop((200, 0, 1000, 800))
img6 = ImageEnhance.Contrast(img6).enhance(1.3)
save_img(img6, 6)
# 7
r, g, b = bases[0].split()
img7 = Image.merge("RGB", (b, g, r))
img7 = ImageEnhance.Color(img7).enhance(0.5)
save_img(img7, 7)
# 8
img8 = bases[1].rotate(5).crop((50, 50, 950, 950))
save_img(img8, 8)
# 9
img9 = bases[2].transpose(Image.Transpose.FLIP_LEFT_RIGHT)
img9 = ImageEnhance.Brightness(img9).enhance(0.6)
save_img(img9, 9)
# 10
img10 = bases[0].transpose(Image.Transpose.FLIP_TOP_BOTTOM).transpose(Image.Transpose.FLIP_LEFT_RIGHT)
img10 = img10.filter(ImageFilter.GaussianBlur(radius=4))
save_img(img10, 10)

print('All 10 images generated.')
