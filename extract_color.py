from PIL import Image
import sys

try:
    img = Image.open('public/images/post-hero-bg.png')
    img = img.convert('RGB')
    
    # Get 3 dominant colors of the entire image
    paletted = img.quantize(colors=3)
    palette = paletted.getpalette()
    print("Top 3 Dominant Colors of entire image:")
    for i in range(3):
        r, g, b = palette[i*3:(i+1)*3]
        hex_color = '#{:02x}{:02x}{:02x}'.format(r, g, b)
        print(f"Color {i+1}: rgb({r}, {g}, {b}) | {hex_color}")
        
except Exception as e:
    print(f"Error: {e}")
