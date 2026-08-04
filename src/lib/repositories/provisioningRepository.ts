import { supabase } from '../../core/config/supabase';

export type ProvisioningOperation = 'root_tenant' | 'child_organisation' | 'status' | 'reset_credential';

export type ResetTargetType = 'root_admin' | 'child_admin';
export type FestivalTemplate = 'sahithyolsav' | 'college_fest';

export interface ProvisioningRequest {
  operation: ProvisioningOperation;
  idempotency_key?: string;
  operation_type?: 'root_tenant' | 'child_organisation';
  org_id?: string;
  parent_id?: string;
  org_name?: string;
  org_type?: string;
  admin_email?: string;
  username?: string;
  target_type?: ResetTargetType;
  organisation_id?: string;
  festival_template?: FestivalTemplate;
}

export interface ProvisioningResponse {
  success?: boolean;
  status?: string;
  operation_id?: string | null;
  tenant_id?: string | null;
  org_id?: string | null;
  organisation_id?: string | null;
  parent_id?: string | null;
  admin_email?: string | null;
  username?: string | null;
  login_identifier?: string | null;
  temporary_password?: string | null;
  target_type?: ResetTargetType | null;
  audit_recorded?: boolean;
  partial_success?: boolean;
  version?: string | null;
  failure_code?: string | null;
  message?: string;
  error?: string;
}

export const provisioningRepository = {
  async provision(payload: ProvisioningRequest): Promise<ProvisioningResponse> {
    const { data, error } = await supabase.functions.invoke('provision-admin', {
      body: payload,
    });
    if (error) throw new Error(error.message);
    const result = (data ?? {}) as ProvisioningResponse;
    if (result.error) {
      const err = new Error(result.message || 'Provisioning failed. Please retry.') as Error & {
        code?: string;
        operationId?: string | null;
      };
      err.code = result.error;
      err.operationId = result.operation_id ?? null;
      throw err;
    }
    return result;
  },
};
