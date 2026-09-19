const fs = require("fs");
const filePath = "src/components/ui/AdminMarkEntryModal.tsx";
let content = fs.readFileSync(filePath, "utf8");

// Add assignedJudges to Props
const propsOld = `  itemType?: string;
  existingMarks: any[];
}`;
const propsNew = `  itemType?: string;
  existingMarks: any[];
  assignedJudges?: { judge_id: string; judge_name: string }[];
}`;
content = content.replace(propsOld, propsNew);

const argsOld = `  itemType,
  existingMarks,
}: Props) {`;
const argsNew = `  itemType,
  existingMarks,
  assignedJudges = [],
}: Props) {`;
content = content.replace(argsOld, argsNew);

// Replace judge extraction
const extractOld = `  // Extract unique judges from existing marks, or mock one if none
  const judges = Array.from(new Set(existingMarks.map(m => m.judge_id)));`;
const extractNew = `  // Extract unique judges from assignedJudges or existing marks
  const judges = assignedJudges.length > 0 
    ? assignedJudges.map(j => j.judge_id)
    : Array.from(new Set(existingMarks.map(m => m.judge_id)));`;
content = content.replace(extractOld, extractNew);

const renderOld = `<Text className={\`font-poppins ml-2 text-xs \${selectedJudgeId === jId ? 'text-orange-700' : 'text-slate-600'}\`}>Judge {idx + 1}</Text>`;
const renderNew = `<Text className={\`font-poppins ml-2 text-xs \${selectedJudgeId === jId ? 'text-orange-700' : 'text-slate-600'}\`}>
  {assignedJudges.find(j => j.judge_id === jId)?.judge_name || \`Judge \${idx + 1}\`}
</Text>`;
content = content.replace(renderOld, renderNew);

fs.writeFileSync(filePath, content, "utf8");
console.log("Updated AdminMarkEntryModal.tsx");
