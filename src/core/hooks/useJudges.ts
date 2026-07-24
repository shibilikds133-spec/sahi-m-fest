import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { judgeService } from '../../services/judgeService';
import { useFestival } from './useFestival';

export const useJudges = () => {
  const queryClient = useQueryClient();
  const { tenant_id } = useAuthStore();
  const { useActiveFestival } = useFestival();
  const { data: festival } = useActiveFestival();

  // ── List all judges for this tenant ──────────────────────────────────────────
  const judges = useQuery({
    queryKey: ['judges', tenant_id],
    queryFn: () => judgeService.listJudges<any>(tenant_id!),
    enabled: !!tenant_id,
  });

  // ── Create judge ──────────────────────────────────────────────────────────────
  const createJudge = useMutation({
    mutationFn: (payload: { name: string; phone?: string; specialization?: string[] }) =>
      judgeService.createJudge<any>(tenant_id!, festival?.id!, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['judges', tenant_id] }),
  });

  // ── Update judge ──────────────────────────────────────────────────────────────
  const updateJudge = useMutation({
    mutationFn: ({ id, ...payload }: { id: string } & Record<string, unknown>) =>
      judgeService.updateJudge<any>(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['judges', tenant_id] }),
  });

  // ── Delete judge ──────────────────────────────────────────────────────────────
  const deleteJudge = useMutation({
    mutationFn: (id: string) => judgeService.deleteJudge(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['judges', tenant_id] }),
  });

  // ── Assign judges to a schedule ───────────────────────────────────────────────
  const assignJudges = useMutation({
    mutationFn: ({ scheduleId, judgeIds }: { scheduleId: string; judgeIds: string[] }) =>
      judgeService.assignJudgesToSchedule(scheduleId, judgeIds),
    onSuccess: (_, { scheduleId }) => {
      queryClient.invalidateQueries({ queryKey: ['scheduleJudges', scheduleId] });
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
    },
  });

  // ── Judges assigned to a specific schedule ────────────────────────────────────
  const useScheduleJudges = (scheduleId: string | undefined) => useQuery({
    queryKey: ['scheduleJudges', scheduleId],
    queryFn: () => judgeService.getScheduleJudges<any>(scheduleId!),
    enabled: !!scheduleId,
  });

  // ── Registrations for a schedule (for mark entry) ─────────────────────────────
  const useScheduleRegistrations = (scheduleId: string | undefined) => useQuery({
    queryKey: ['scheduleRegistrations', scheduleId],
    queryFn: () => judgeService.getRegistrationsBySchedule<any>(scheduleId!),
    enabled: !!scheduleId,
  });

  // ── Mark entries for a schedule ───────────────────────────────────────────────
  const useMarkEntries = (scheduleId: string | undefined) => useQuery({
    queryKey: ['markEntries', scheduleId],
    queryFn: () => judgeService.listMarkEntries<any>(scheduleId!),
    enabled: !!scheduleId,
  });

  // ── Save (draft) mark entry ───────────────────────────────────────────────────
  const saveMarkEntry = useMutation({
    mutationFn: (payload: {
      schedule_id: string;
      judge_id: string;
      registration_id: string;
      criteria_scores: Record<string, number>;
      total_mark: number;
      is_draft?: boolean;
    }) => judgeService.saveMarkEntry<any>({ ...payload, tenant_id: tenant_id! }),
    onSuccess: (_, { schedule_id }) =>
      queryClient.invalidateQueries({ queryKey: ['markEntries', schedule_id] }),
  });

  // ── Finalize mark entry ───────────────────────────────────────────────────────
  const finalizeMarkEntry = useMutation({
    mutationFn: (markEntryId: string) => judgeService.finalizeMarkEntry(markEntryId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['markEntries'] }),
  });

  // ── Results ───────────────────────────────────────────────────────────────────
  const useResults = (scheduleId: string | undefined) => useQuery({
    queryKey: ['results', scheduleId],
    queryFn: () => judgeService.listResults<any>(scheduleId!),
    enabled: !!scheduleId,
  });

  const publishResults = useMutation({
    mutationFn: (payloads: Record<string, unknown>[]) => judgeService.publishResults(payloads),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['results'] });
      queryClient.invalidateQueries({ queryKey: ['scheduleReadiness'] });
      queryClient.invalidateQueries({ queryKey: ['judgeSubmissionSummary'] });
      queryClient.invalidateQueries({ queryKey: ['festival-results'] });
      queryClient.invalidateQueries({ queryKey: ['public-leaderboard'] });
      queryClient.invalidateQueries({ queryKey: ['public-published-results'] });
    },
  });

  // ── Judge submission summary (per-judge status for a schedule) ────────────────
  const useJudgeSubmissionSummary = (scheduleId: string | undefined) => useQuery({
    queryKey: ['judgeSubmissionSummary', scheduleId],
    queryFn: () => judgeService.getJudgeSubmissionSummary<any>(scheduleId!),
    enabled: !!scheduleId,
    refetchInterval: 30000, // auto-refresh every 30s
  });

  // ── Schedule readiness per-participant ────────────────────────────────────────
  const useScheduleReadiness = (scheduleId: string | undefined) => useQuery({
    queryKey: ['scheduleReadiness', scheduleId],
    queryFn: () => judgeService.getScheduleReadiness<any>(scheduleId!),
    enabled: !!scheduleId,
    refetchInterval: 30000,
  });

  return {
    judges: judges.data ?? [],
    isLoadingJudges: judges.isLoading,
    createJudge,
    updateJudge,
    deleteJudge,
    assignJudges,
    useScheduleJudges,
    useScheduleRegistrations,
    useMarkEntries,
    saveMarkEntry,
    finalizeMarkEntry,
    useResults,
    publishResults,
    useJudgeSubmissionSummary,
    useScheduleReadiness,
  };
};
