with open('src/app/(admin)/settings/leaderboard/item-results.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

# 1. Update useState
c = c.replace(
    "const [resultStatusFilter, setResultStatusFilter] = useState<'all' | ResultStatus>('all');",
    "const [resultStatusFilter, setResultStatusFilter] = useState<'all' | 'unpublished' | ResultStatus>('all');"
)

# 2. Update statusMatch
old_status_match = "const statusMatch = resultStatusFilter === 'all'\n          || r.result_status === resultStatusFilter;"
new_status_match = "const statusMatch = resultStatusFilter === 'all'\n          || (resultStatusFilter === 'unpublished' && r.result_status !== 'published')\n          || r.result_status === resultStatusFilter;"
c = c.replace(old_status_match, new_status_match)

# 3. Update UI buttons
old_ui = "{(['all', 'published', 'ready', 'draft', 'hidden'] as const).map(s => ("
new_ui = "{(['all', 'published', 'unpublished', 'ready', 'draft', 'hidden'] as const).map(s => ("
c = c.replace(old_ui, new_ui)

# 4. Update label logic
old_label = "{s === 'all' ? 'All Status' : STATUS_CONFIG[s as ResultStatus]?.label ?? s}"
new_label = "{s === 'all' ? 'All Status' : s === 'unpublished' ? 'Unpublished' : STATUS_CONFIG[s as ResultStatus]?.label ?? s}"
c = c.replace(old_label, new_label)

with open('src/app/(admin)/settings/leaderboard/item-results.tsx', 'w', encoding='utf-8') as f:
    f.write(c)
