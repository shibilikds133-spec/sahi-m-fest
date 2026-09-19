import re
with open('src/app/(admin)/settings/leaderboard/item-results.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

c = re.sub(
    r"const statusMatch = resultStatusFilter === 'all'\s*\|\|\s*r\.result_status === resultStatusFilter;",
    "const statusMatch = resultStatusFilter === 'all'\n        || (resultStatusFilter === 'unpublished' && r.result_status !== 'published')\n        || r.result_status === resultStatusFilter;",
    c
)

with open('src/app/(admin)/settings/leaderboard/item-results.tsx', 'w', encoding='utf-8') as f:
    f.write(c)
