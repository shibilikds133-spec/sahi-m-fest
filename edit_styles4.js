const fs = require('fs');
let code = fs.readFileSync('src/app/(admin)/smart-announcer/index.tsx', 'utf-8');

const start = code.indexOf("  card: {");
const endMatch = code.match(/publishText: \{[\s\S]*?\}/);

if (start !== -1 && endMatch) {
  const stylesReplacement = `  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: ui.colors.border,
    shadowColor: ui.shadow.shadowColor,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    gap: 16,
    flexWrap: 'wrap',
  },
  topRow: {
    borderColor: ui.colors.primary,
    borderWidth: 2,
  },
  rowLeft: {
    flex: 1,
    minWidth: 200,
  },
  badgeSmall: {
    backgroundColor: ui.colors.primary,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginBottom: 8,
  },
  badgeTextSmall: {
    color: 'white',
    fontWeight: '700',
    fontSize: 10,
    textTransform: 'uppercase',
  },
  itemName: {
    fontSize: 18,
    fontWeight: '700',
    color: ui.colors.text,
    marginBottom: 4,
  },
  orderTextSmall: {
    fontSize: 12,
    fontWeight: '500',
    color: ui.colors.textMuted,
  },
  rowMiddle: {
    flex: 2,
    minWidth: 250,
    backgroundColor: ui.colors.surfaceMuted,
    padding: 12,
    borderRadius: 8,
  },
  impactTitleSmall: {
    fontSize: 12,
    fontWeight: '600',
    color: ui.colors.textMuted,
    marginBottom: 8,
  },
  statsCompact: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  statCompactText: {
    fontSize: 13,
    fontWeight: '600',
    color: ui.colors.text,
  },
  leaderTextSmall: {
    fontSize: 12,
    color: ui.colors.textMuted,
  },
  leaderHighlight: {
    fontWeight: '700',
    color: ui.colors.text,
  },
  rowRight: {
    justifyContent: 'center',
  },
  publishBtnSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ui.colors.text,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 8,
  },
  publishTextSmall: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  }`;

  const end = code.indexOf(endMatch[0]) + endMatch[0].length;
  code = code.substring(0, start) + stylesReplacement + code.substring(end);
  fs.writeFileSync('src/app/(admin)/smart-announcer/index.tsx', code, 'utf-8');
  console.log("STYLES replaced.");
} else {
  console.log("STYLES NOT FOUND");
}
