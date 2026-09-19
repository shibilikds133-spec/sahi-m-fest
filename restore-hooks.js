const fs = require('fs');
let code = fs.readFileSync('src/core/hooks/useJudges.ts', 'utf8');

if(!code.includes('adminUpsertMark')) {
  const insertIndex = code.indexOf('return {');
  
  const mutationCode = `
  // Admin manual mark override
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
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['results', variables.scheduleId] });
      queryClient.invalidateQueries({ queryKey: ['registrations', variables.scheduleId] });
      queryClient.invalidateQueries({ queryKey: ['judges', variables.scheduleId] });
    }
  });
  `;
  
  code = code.substring(0, insertIndex) + mutationCode + code.substring(insertIndex);
  code = code.replace('return {', 'return {\n    adminUpsertMark: adminUpsertMark.mutateAsync,');
  fs.writeFileSync('src/core/hooks/useJudges.ts', code);
  console.log('Restored adminUpsertMark in useJudges');
}
