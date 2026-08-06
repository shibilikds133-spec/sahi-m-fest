import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useTeamLeaderContext } from '@/core/contexts/TeamLeaderContext';
import { TeamLeaderAppShell } from '@/components/layout/TeamLeaderAppShell';
import { teamLeaderPortalService, TeamLeaderStanding } from '@/services/teamLeaderPortalService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/shadcn/card';
import { Badge } from '@/components/ui/shadcn/badge';
import { Skeleton } from '@/components/ui/shadcn/skeleton';

export default function MyTeamScreen() {
  const { context, loading: contextLoading } = useTeamLeaderContext();
  const [standings, setStandings] = useState<TeamLeaderStanding[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!context) return;
    teamLeaderPortalService.getStandings().then((data) => {
      setStandings(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [context]);

  if (contextLoading || loading) {
    return (
      <TeamLeaderAppShell>
        <View style={{ gap: 12 }}>
          <Skeleton style={{ height: 100, borderRadius: 12 }} />
          <Skeleton style={{ height: 200, borderRadius: 12 }} />
        </View>
      </TeamLeaderAppShell>
    );
  }

  const ownTeam = standings.find((s) => s.is_own_team);
  const ownRank = ownTeam?.rank ?? 0;
  const totalPoints = ownTeam?.total_points ?? 0;
  const pointsBehind = standings.length > 0 ? standings[0].total_points - totalPoints : 0;

  return (
    <TeamLeaderAppShell>
      <View style={{ gap: 16 }}>
        <View>
          <Text style={{ fontSize: 20, fontWeight: '700', color: '#111827' }}>My Team</Text>
          <Text style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>
            Team standings and leaderboard
          </Text>
        </View>

        {/* Team Summary */}
        {ownTeam && (
          <Card>
            <CardContent style={{ padding: 16 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  <Text style={{ fontSize: 12, color: '#64748B' }}>Your Team</Text>
                  <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827', marginTop: 2 }}>
                    {ownTeam.team_name}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 12, color: '#64748B' }}>Rank</Text>
                  <Text style={{ fontSize: 24, fontWeight: '700', color: '#0F766E' }}>
                    #{ownRank}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 16, marginTop: 12 }}>
                <View>
                  <Text style={{ fontSize: 12, color: '#64748B' }}>Total Points</Text>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: '#111827' }}>{totalPoints}</Text>
                </View>
                {ownRank > 1 && (
                  <View>
                    <Text style={{ fontSize: 12, color: '#64748B' }}>Behind Rank 1</Text>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: '#DC2626' }}>-{pointsBehind}</Text>
                  </View>
                )}
              </View>
            </CardContent>
          </Card>
        )}

        {/* All Standings */}
        <Card>
          <CardHeader>
            <CardTitle>Festival Standings</CardTitle>
          </CardHeader>
          <CardContent>
            {standings.length === 0 ? (
              <Text style={{ fontSize: 13, color: '#64748B', textAlign: 'center', padding: 16 }}>
                No standings available
              </Text>
            ) : (
              <View style={{ gap: 4 }}>
                {standings.map((team) => (
                  <View
                    key={team.organisation_id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      padding: 12,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: team.is_own_team ? '#0F766E' : '#E2E8F0',
                      backgroundColor: team.is_own_team ? '#F0FDFA' : '#FFFFFF',
                    }}
                  >
                    <View style={{ width: 32, alignItems: 'center' }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: team.is_own_team ? '#0F766E' : '#111827' }}>
                        #{team.rank}
                      </Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={{ fontSize: 14, fontWeight: team.is_own_team ? '700' : '500', color: '#111827' }}>
                        {team.team_name}
                        {team.is_own_team && (
                          <Text style={{ fontSize: 11, color: '#0F766E', marginLeft: 6 }}>Your Team</Text>
                        )}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#111827' }}>
                      {team.total_points}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </CardContent>
        </Card>
      </View>
    </TeamLeaderAppShell>
  );
}
