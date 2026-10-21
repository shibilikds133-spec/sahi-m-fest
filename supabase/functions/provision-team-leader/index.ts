import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (status: number, body: any) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders },
});

function normalizeEmail(email: any) {
  if (!email || typeof email !== 'string') return null;
  const normalized = email.trim().toLowerCase();
  if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(normalized)) return null;
  if (normalized.length > 254) return null;
  return normalized;
}

async function makeLoginCredentials(admin: ReturnType<typeof createClient>) {
  // Keep initial usernames short and independent of long team/participant names.
  // Check the existing unique profile index before creating the Auth user.
  let username = '';
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
    const candidate = `teamleader_${suffix}`;
    const { data, error } = await admin
      .from('profiles')
      .select('id')
      .eq('team_leader_code', candidate)
      .maybeSingle();
    if (error) throw new Error('Could not verify Team Leader username availability.');
    if (!data) {
      username = candidate;
      break;
    }
  }
  if (!username) throw new Error('Could not generate an available Team Leader username. Please retry.');

  const password = `Aa1!${crypto.randomUUID()}`;
  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  const email = `${username}_${suffix}@sahi.local`;
  return { username, email, password };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return json(500, { error: 'SERVER_CONFIG_ERROR', message: 'Server is not configured properly.' });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1. Authenticate the caller
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return json(401, { error: 'UNAUTHORIZED', message: 'Missing authorization header' });

    const { data: { user }, error: authError } = await admin.auth.getUser(token);
    if (authError || !user) return json(401, { error: 'UNAUTHORIZED', message: 'Invalid JWT' });

    // 2. Validate input
    let body;
    try {
      body = await req.json();
    } catch {
      return json(400, { error: 'INVALID_JSON', message: 'Invalid request body.' });
    }

    // Use the caller's JWT for authorization and tenant-scoped visibility checks.
    const callerClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    if (body?.action === 'reset_password') {
      const targetUserId = typeof body?.user_id === 'string' ? body.user_id : '';
      const festivalId = typeof body?.festival_id === 'string' ? body.festival_id : '';
      if (!targetUserId || !festivalId) {
        return json(400, { error: 'INVALID_RESET_TARGET', message: 'A user and festival are required.' });
      }

      const { data: callerProfile, error: callerProfileError } = await callerClient
        .from('profiles')
        .select('id, role, is_superadmin')
        .eq('id', user.id)
        .maybeSingle();
      if (callerProfileError || !callerProfile || (callerProfile.role !== 'admin' && callerProfile.is_superadmin !== true)) {
        return json(403, { error: 'FORBIDDEN', message: 'Only an authorized administrator can reset Team Leader passwords.' });
      }

      const { data: visibleAssignments, error: assignmentError } = await callerClient.rpc(
        'get_team_leader_assignments_for_admin',
        { p_festival_id: festivalId },
      );
      if (assignmentError) {
        return json(403, { error: 'ASSIGNMENT_CHECK_FAILED', message: 'Could not verify access to this Team Leader assignment.' });
      }
      const targetAssignment = (visibleAssignments || []).find((assignment: any) => assignment.user_id === targetUserId);
      if (!targetAssignment) {
        return json(404, { error: 'ASSIGNMENT_NOT_FOUND', message: 'The Team Leader assignment is not available to this administrator.' });
      }

      const { data: targetProfile, error: targetProfileError } = await admin
        .from('profiles')
        .select('team_leader_code, role')
        .eq('id', targetUserId)
        .maybeSingle();
      if (targetProfileError || targetProfile?.role !== 'team_leader') {
        return json(404, { error: 'TEAM_LEADER_NOT_FOUND', message: 'A valid Team Leader account was not found.' });
      }

      const password = `Aa1!${crypto.randomUUID()}`;
      const { error: passwordError } = await admin.auth.admin.updateUserById(targetUserId, {
        password,
        user_metadata: { must_change_credentials: true },
      });
      if (passwordError) {
        return json(502, { error: 'PASSWORD_RESET_FAILED', message: 'Could not reset the Team Leader password.' });
      }

      return json(200, {
        success: true,
        username: targetProfile.team_leader_code || '',
        password,
        must_change_credentials: true,
      });
    }

    // Self-update handler for team leaders on first login
    if (body?.action === 'self_update_credentials') {
      const newUsername = typeof body?.new_username === 'string' ? body.new_username.trim().toLowerCase() : '';
      const newPassword = typeof body?.new_password === 'string' ? body.new_password : '';

      if (!/^[a-z0-9_]{3,30}$/.test(newUsername)) {
        return json(400, { error: 'INVALID_USERNAME', message: 'Username must be 3-30 lowercase letters, numbers, or underscores.' });
      }
      if (!newPassword || newPassword.length < 6) {
        return json(400, { error: 'INVALID_PASSWORD', message: 'Password must be at least 6 characters.' });
      }

      // Verify caller profile
      const { data: callerProf, error: profErr } = await admin
        .from('profiles')
        .select('id, role')
        .eq('id', user.id)
        .maybeSingle();

      if (profErr || !callerProf || callerProf.role !== 'team_leader') {
        return json(403, { error: 'FORBIDDEN', message: 'Only an authorized Team Leader can update their credentials.' });
      }

      // Check if username is taken by another profile
      const { data: existingUser } = await admin
        .from('profiles')
        .select('id')
        .eq('team_leader_code', newUsername)
        .neq('id', user.id)
        .maybeSingle();

      if (existingUser) {
        return json(409, { error: 'USERNAME_TAKEN', message: 'This username is already taken. Please choose another.' });
      }

      const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 4);
      const newEmail = `${newUsername}_${suffix}@sahi.local`;

      // Update auth user password, email, and clear must_change_credentials flag
      const { error: authUpdateError } = await admin.auth.admin.updateUserById(user.id, {
        email: newEmail,
        password: newPassword,
        user_metadata: {
          must_change_credentials: false,
        },
      });
      if (authUpdateError) {
        return json(502, { error: 'AUTH_UPDATE_FAILED', message: authUpdateError.message });
      }

      // Update profile
      const { error: profileUpdateError } = await admin
        .from('profiles')
        .update({
          team_leader_code: newUsername,
          team_leader_email: newEmail,
        })
        .eq('id', user.id);

      if (profileUpdateError) {
        return json(502, { error: 'PROFILE_UPDATE_FAILED', message: profileUpdateError.message });
      }

      return json(200, {
        success: true,
        username: newUsername,
        message: 'Credentials updated successfully.',
      });
    }

    const participantId = body?.participant_id;
    if (!participantId || typeof participantId !== 'string') {
      return json(400, { error: 'INVALID_PARTICIPANT', message: 'Valid participant_id is required.' });
    }

    const requestedEmail = body?.email ? normalizeEmail(body.email) : null;
    if (body?.email && !requestedEmail) {
      return json(400, { error: 'INVALID_EMAIL', message: 'Valid email is required.' });
    }

    const requestedPassword = body?.password;
    if (body?.password && (!requestedPassword || typeof requestedPassword !== 'string' || requestedPassword.length < 6)) {
      return json(400, { error: 'INVALID_PASSWORD', message: 'Password must be at least 6 characters.' });
    }

    const idempotencyKey = body?.idempotency_key || crypto.randomUUID();
    const resetPassword = body?.reset_password === true;

    // Authorize the caller and target before using the service role.
    // The service role is never used as proof that the caller may manage data.
    const { data: callerProfile, error: callerProfileError } = await callerClient
      .from('profiles')
      .select('id, role, is_superadmin')
      .eq('id', user.id)
      .maybeSingle();
    if (callerProfileError || !callerProfile || (callerProfile.role !== 'admin' && callerProfile.is_superadmin !== true)) {
      return json(403, { error: 'FORBIDDEN', message: 'Only an authorized administrator can provision Team Leader accounts.' });
    }

    const { data: participant, error: participantError } = await callerClient
      .from('participants')
      .select('id, name, festival_id, tenant_id, organisation_id, user_id')
      .eq('id', participantId)
      .maybeSingle();
    if (participantError || !participant) {
      return json(404, { error: 'PARTICIPANT_NOT_FOUND', message: 'The selected participant is not accessible.' });
    }
    if (participant.user_id && !resetPassword) {
      return json(409, { error: 'PARTICIPANT_ALREADY_LINKED', message: 'This participant already has a linked account.' });
    }

    const { data: festival, error: festivalError } = await callerClient
      .from('festival_calendar')
      .select('id, is_active')
      .eq('id', participant.festival_id)
      .maybeSingle();
    if (festivalError || !festival || festival.is_active !== true) {
      return json(409, { error: 'FESTIVAL_NOT_ACTIVE', message: 'The participant does not belong to an active festival.' });
    }

    // Look up team name if available
    let teamName = typeof body?.team_name === 'string' ? body.team_name.trim() : '';
    if (!teamName && participant.organisation_id) {
      const { data: org } = await callerClient
        .from('organisations')
        .select('name')
        .eq('id', participant.organisation_id)
        .maybeSingle();
      if (org?.name) teamName = org.name;
    }

    if (resetPassword && participant.user_id) {
      const [{ data: linkedProfile, error: linkedProfileError }, { data: linkedAuthUser, error: linkedAuthError }] = await Promise.all([
        admin
          .from('profiles')
          .select('team_leader_code, team_leader_email, role')
          .eq('id', participant.user_id)
          .maybeSingle(),
        admin.auth.admin.getUserById(participant.user_id),
      ]);

      if (linkedProfileError || linkedAuthError || !linkedAuthUser?.user || linkedProfile?.role !== 'team_leader') {
        return json(409, { error: 'TEAM_LEADER_ACCOUNT_NOT_FOUND', message: 'A valid Team Leader account was not found for this participant.' });
      }

      const newPassword = requestedPassword || `Aa1!${crypto.randomUUID()}`;
      const { error: passwordError } = await admin.auth.admin.updateUserById(participant.user_id, {
        password: newPassword,
        user_metadata: {
          must_change_credentials: true,
        },
      });
      if (passwordError) {
        return json(502, { error: 'PASSWORD_RESET_FAILED', message: 'Could not generate a new Team Leader password.' });
      }

      const activeUsername = linkedProfile.team_leader_code || linkedProfile.team_leader_email || linkedAuthUser.user.email;

      return json(200, {
        success: true,
        reset: true,
        participant_id: participantId,
        user_id: participant.user_id,
        username: activeUsername,
        password: newPassword,
        must_change_credentials: true,
        message: 'A new Team Leader password was generated successfully. First login change required.',
      });
    }

    const generated = await makeLoginCredentials(admin);
    const username = (typeof body?.username === 'string' && body.username.trim()) ? body.username.trim().toLowerCase() : generated.username;
    const password = requestedPassword || generated.password;
    // Internal synthetic email mapped from username for resolve_login_email compatibility
    const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 4);
    const email = `${username}_${suffix}@sahi.local`;

    // 5. Create Auth User securely (Service Role)
    const { data: createdUser, error: createError } = await admin.auth.admin.createUser({
      email,
      password: password,
      email_confirm: true,
      user_metadata: {
        must_change_credentials: true,
      },
    });

    if (createError || !createdUser?.user) {
      // Typically if email exists, createError.status might be 422 or 400.
      return json(409, {
        error: 'AUTH_USER_CREATE_FAILED',
        message: 'An account with this login already exists and is not linked to this participant.',
      });
    }

    const newUserId = createdUser.user.id;

    // The global auth trigger creates a default profile before this function
    // can finalise the participant link. Normalize only this newly-created
    // user so the finalisation RPC can safely promote it to team_leader.
    const { error: profileSeedError } = await admin
      .from('profiles')
      .update({
        tenant_id: participant.tenant_id,
        role: 'participant',
        full_name: participant.name,
      })
      .eq('id', newUserId);
    if (profileSeedError) {
      await admin.auth.admin.deleteUser(newUserId);
      return json(502, {
        error: 'PROFILE_INITIALIZATION_FAILED',
        message: 'Account creation could not be initialized. The temporary account was removed.',
      });
    }

    // 5. Finalise Database Linkage
    const { data: finaliseData, error: finaliseError } = await callerClient.rpc('finalise_team_leader_provisioning', {
      p_participant_id: participantId,
      p_user_id: newUserId,
      p_email: email,
      p_idempotency_key: idempotencyKey,
    });

    // 6. Partial Failure Compensation
    if (finaliseError || !finaliseData?.success) {
      console.error('Finalise RPC failed:', finaliseError?.message);
      // Clean up ONLY the newly created auth user
      const { error: deleteError } = await admin.auth.admin.deleteUser(newUserId);
      if (deleteError) {
        console.error('Compensation deleteUser failed:', deleteError.message);
      }
      
      const errMsg = finaliseError?.message || 'Database linkage failed.';
      // Friendly message based on exact RPC errors
      if (errMsg.includes('Unauthorized')) {
         return json(403, { error: 'UNAUTHORIZED', message: 'You are not authorized to manage this participant.' });
      }
      if (errMsg.includes('idx_participants_festival_user')) {
         return json(409, { error: 'DUPLICATE_FESTIVAL_PARTICIPANT', message: 'This user is already linked to a participant in this festival.' });
      }
      if (errMsg.includes('Role Conflict')) {
         return json(409, { error: 'ROLE_CONFLICT', message: errMsg });
      }

      return json(502, {
        error: 'PROVISIONING_FAILED_COMPENSATED',
        message: 'Account creation failed during database linkage. The temporary account was removed. Please retry.',
        details: errMsg
      });
    }

    const { error: identityError } = await admin
      .from('profiles')
      .update({ team_leader_code: username, team_leader_email: email })
      .eq('id', newUserId);
    if (identityError) {
      // The linkage RPC has already committed at this point. Remove only the
      // link created by this request before deleting the temporary Auth user,
      // so a failed credential-persistence step cannot leave an orphaned
      // participant account link behind.
      await admin
        .from('participants')
        .update({ user_id: null })
        .eq('id', participantId)
        .eq('user_id', newUserId);
      await admin.auth.admin.deleteUser(newUserId);
      return json(502, {
        error: 'IDENTITY_PERSISTENCE_FAILED',
        message: 'Account creation could not be completed. The temporary account was removed.',
      });
    }

    // 7. Success
    return json(200, {
      success: true,
      participant_id: participantId,
      user_id: newUserId,
      username,
      password,
      must_change_credentials: true,
      message: 'Team Leader account created successfully.'
    });

  } catch (err: any) {
    console.error('provision-team-leader error', err?.message);
    return json(500, { error: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' });
  }
});
