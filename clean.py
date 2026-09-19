
import re
with open('src/app/(admin)/settings/leaderboard/item-results.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

c = re.sub(r'\{itemCategoryCodes\.get\(group\.item_id\)\?\.map\(\(code: string\) => \{.*?\}\)\}', '', c, flags=re.DOTALL)

with open('src/app/(admin)/settings/leaderboard/item-results.tsx', 'w', encoding='utf-8') as f:
    f.write(c)

