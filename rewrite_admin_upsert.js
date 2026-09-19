const fs = require("fs");
const filePath = "src/core/hooks/useJudges.ts";
let content = fs.readFileSync(filePath, "utf8");

const oldCode = `    // Admin manual mark override
    const adminUpsertMark = useMutation({
      mutationFn: async ({ scheduleId, judgeId, registrationId, criteriaMarks, isAbsent }: { scheduleId: string, judgeId: string, registrationId: string, criteriaMarks: any, isAbsent: boolean }) => {
        const { data, error } = await supabase.rpc('admin_upsert_mark', {
          p_schedule_id: scheduleId,
          p_judge_id: judgeId,
          p_registration_id: registrationId,
          p_criteria_marks: criteriaMarks,
          p_is_absent: isAbsent
        });
        if (error) throw error;
        return data;
      },
      onSuccess: (_, variables) => {`;

const newCode = `    // Admin manual mark override
    const adminUpsertMark = useMutation({
      mutationFn: async ({ scheduleId, judgeId, registrationId, criteriaScores, totalMark, maxMark, criteriaSnapshot, status }: { scheduleId: string, judgeId: string, registrationId: string, criteriaScores: any, totalMark: number, maxMark: number, criteriaSnapshot: any, status: string }) => {
        const { data: schedule } = await supabase.from('schedules').select('tenant_id').eq('id', scheduleId).single();
        const { data, error } = await supabase.from('mark_entries').upsert({
          schedule_id: scheduleId,
          judge_id: judgeId,
          registration_id: registrationId,
          tenant_id: schedule?.tenant_id,
          criteria_scores: criteriaScores,
          total_mark: totalMark,
          max_mark_snapshot: maxMark,
          criteria_snapshot: criteriaSnapshot,
          entry_mode_snapshot: Object.keys(criteriaScores || {}).length > 0 ? 'criteria' : 'total_only',
          is_draft: status === 'draft',
          is_final: status === 'final',
          submitted_at: status === 'final' ? new Date().toISOString() : null,
        }, { onConflict: 'schedule_id,judge_id,registration_id' }).select().single();
        if (error) throw error;
        return data;
      },
      onSuccess: (_, variables) => {`;

if (content.includes(oldCode)) {
    content = content.replace(oldCode, newCode);
} else {
    // try replacing with regex ignoring whitespace
    const regex = /const adminUpsertMark = useMutation\(\{\s*mutationFn:\s*async\s*\(\{\s*scheduleId.*?onSuccess:\s*\(_,\s*variables\)\s*=>\s*\{/s;
    if (regex.test(content)) {
        content = content.replace(regex, newCode);
    } else {
        console.error("Could not find block to replace in useJudges.ts");
        process.exit(1);
    }
}

fs.writeFileSync(filePath, content, "utf8");
console.log("Rewrote adminUpsertMark in useJudges.ts");
