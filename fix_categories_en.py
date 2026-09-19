import re

with open('src/constants/categories.ts', 'r', encoding='utf-8') as f:
    code = f.read()

code = re.sub(r'name_ml:\s*"\?\?\?.*?"', lambda m: 'name_ml: "Sub Junior"' if 'SBJ' in code[:m.start()] else m.group(0), code)

# Let's just do precise replacements
code = code.replace('name_ml: "??? ??????"', 'name_ml: "Sub Junior"')
code = code.replace('name_ml: "??????"', 'name_ml: "Junior"', 1)
code = code.replace('name_ml: "??????"', 'name_ml: "Senior"', 1)

with open('src/constants/categories.ts', 'w', encoding='utf-8') as f:
    f.write(code)

print("Updated to English")
