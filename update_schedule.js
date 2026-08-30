const fs = require('fs');

function updateFile(filePath) {
  let c = fs.readFileSync(filePath, 'utf8');

  // Replace TimeSelect component definition
  const timeSelectStart = c.indexOf('const TimeSelect =');
  const timeSelectEnd = c.indexOf('export default function');
  if (timeSelectStart !== -1 && timeSelectEnd !== -1) {
    c = c.substring(0, timeSelectStart) + "import { SmartTimeInput } from '@/components/ui/SmartTimeInput';\n\n" + c.substring(timeSelectEnd);
  }

  // Replace <TimeSelect> usage
  c = c.replace(/<TimeSelect /g, '<SmartTimeInput ');

  // Handle sticky date in create.tsx
  if (filePath.includes('create.tsx')) {
    const replacement = `
  const [startDate, setStartDate] = useState(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      return window.localStorage.getItem('ssf_last_schedule_date') || '';
    }
    return '';
  });
  const [startTimeStr, setStartTimeStr] = useState('09:00');
  const [endDate, setEndDate] = useState(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      return window.localStorage.getItem('ssf_last_schedule_date') || '';
    }
    return '';
  });
  const [endTimeStr, setEndTimeStr] = useState('10:00');
`;
    // Replace the exact 4 lines of state declarations
    c = c.replace(/const \[startDate, setStartDate\] = useState\(''\);\s*const \[startTimeStr, setStartTimeStr\] = useState\('09:00'\);\s*const \[endDate, setEndDate\] = useState\(''\);\s*const \[endTimeStr, setEndTimeStr\] = useState\('10:00'\);/g, replacement);

    // Save date hook
    const saveTarget = 'const result = await createSchedule({';
    const saveHook = `
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.localStorage.setItem('ssf_last_schedule_date', startDate);
      }
      const result = await createSchedule({`;
    c = c.replace(saveTarget, saveHook);
  }

  fs.writeFileSync(filePath, c);
  console.log(`Updated ${filePath}`);
}

updateFile('src/app/(admin)/schedule/create.tsx');
try {
  updateFile('src/app/(admin)/schedule/[id]/edit.tsx');
} catch (e) {
  console.log('No edit.tsx found or skipped');
}
