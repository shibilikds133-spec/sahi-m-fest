import { judgeTokenRepository } from '../lib/repositories/judgeTokenRepository';
import { databaseProvider } from '../providers/database';
export const judgeTokenService = {
  async generateToken(payload: {
    judgeId: string;
    scheduleId: string;
    tenantId: string;
    createdBy: string;
  }) {
    const { data, error } = await judgeTokenRepository.generateToken<any>(payload);
    if (error) throw new Error(error.message);
    return data;
  },

  async validateToken(token: string) {
    const { data, error } = await judgeTokenRepository.validateToken<any>(token);
    if (error) throw new Error(error.message);
    if (data && data.judge_id && data.schedule_id && data.tenant_id) {
      try {
        const maskedToken = `****${token.slice(-2)}`;
        // Dynamic import to avoid breaking react-native vs nextjs if Platform isn't universally safe
        let platform = 'Unknown';
        try {
          const { Platform } = require('react-native');
          platform = Platform.OS;
        } catch (e) {}

        await databaseProvider.logJudgeActivity({
          judgeId: data.judge_id,
          scheduleId: data.schedule_id,
          tenantId: data.tenant_id,
          actionType: 'LOGIN',
          actionDetails: {
            otpMasked: maskedToken,
            platform,
            timestamp: new Date().toISOString()
          }
        });
      } catch (logErr) {
        console.error('Failed to log judge activity', logErr);
      }
    }
    return data;
  },

  async expireToken(token: string) {
    const { error } = await judgeTokenRepository.expireToken(token);
    if (error) throw new Error(error.message);
  },

  async listTokens(scheduleId: string) {
    const { data, error } = await judgeTokenRepository.listTokens<any>(scheduleId);
    if (error) throw new Error(error.message);
    return data ?? [];
  },
};
