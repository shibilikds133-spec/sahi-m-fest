const fs = require('fs'); let c = fs.readFileSync('supabase/migrations/172_public_leaderboard_item_limit.sql', 'utf8'); c = c.replace(/JOIN organisations org ON org\\.id = COALESCE\\(reg\\.tenant_id, festival\\.tenant_id\\)/g, \LEFT JOIN participants participant ON participant.id = reg.participant_id
  LEFT JOIN organisations org
    ON org.id = COALESCE(reg.organisation_id, participant.organisation_id)
  WHERE org.id IS NOT NULL
    AND (
      org.tenant_id = v_festival_tenant_id
      OR org.parent_id IN (
        SELECT id FROM organisations WHERE tenant_id = v_festival_tenant_id
      )
      OR org.tenant_id IN (
        SELECT DISTINCT o2.tenant_id
        FROM organisations o2
        WHERE o2.id = org.parent_id AND o2.tenant_id = v_festival_tenant_id
      )
    )\); fs.writeFileSync('supabase/migrations/172_public_leaderboard_item_limit.sql', c);
