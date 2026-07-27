import { judgeTokenRepository } from '../lib/repositories/judgeTokenRepository';
import { databaseProvider } from '../providers/database';
export const judgeTokenService = {
  async generateToken(payload: {
    judgeId: string;
    scheduleId: string;
    tenantId: string;
    createdBy: string;
    forceRefresh?: boolean;
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
        let platform = 'Unknown';
        try {
          const { Platform } = require('react-native');
          platform = Platform.OS;
        } catch (e) {}

        await databaseProvider.logJudgeActivity({
          judgeId: data.judge_id,
          scheduleId: data.schedule_id,
          tenantId: data.tenant_id,
          actionType: 'LOGIN_REQUESTED',
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

  async requestLogin(tokenId: string) {
    // We update the token status to pending_approval via direct update
    // We assume the user has anon or authenticated access (RLS was updated)
    const { supabase } = require('../core/config/supabase');
    const { error } = await supabase
      .from('judge_tokens')
      .update({ status: 'pending_approval' })
      .eq('id', tokenId);
    if (error) throw new Error(error.message);
  },

  async approveLogin(tokenId: string) {
    const { supabase } = require('../core/config/supabase');
    const { error } = await supabase
      .from('judge_tokens')
      .update({ status: 'approved' })
      .eq('id', tokenId);
    if (error) throw new Error(error.message);
  },

  async rejectLogin(tokenId: string) {
    const { supabase } = require('../core/config/supabase');
    const { error } = await supabase
      .from('judge_tokens')
      .update({ status: 'rejected' })
      .eq('id', tokenId);
    if (error) throw new Error(error.message);
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
