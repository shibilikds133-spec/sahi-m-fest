const fs = require('fs');
let c = fs.readFileSync('src/app/(admin)/schedule/create.tsx', 'utf8');
c = c.replace('await createSchedule({', `if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.localStorage.setItem('ssf_last_schedule_date', startDate);
      }
      await createSchedule({`);
fs.writeFileSync('src/app/(admin)/schedule/create.tsx', c);
