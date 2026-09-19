import re

with open('src/constants/categories.ts', 'r', encoding='utf-8') as f:
    code = f.read()

# Fix JR and SR
code = re.sub(r'(code:\s*"JR",\s*name_en:\s*"Junior",\s*name_ml:\s*)"Sub Junior"', r'\1"Junior"', code)
code = re.sub(r'(code:\s*"SR",\s*name_en:\s*"Senior",\s*name_ml:\s*)"Sub Junior"', r'\1"Senior"', code)

with open('src/constants/categories.ts', 'w', encoding='utf-8') as f:
    f.write(code)

print("Fixed Junior and Senior")
