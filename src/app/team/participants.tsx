import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useTeamLeaderContext } from '@/core/contexts/TeamLeaderContext';
import { TeamLeaderAppShell } from '@/components/layout/TeamLeaderAppShell';
import { teamLeaderPortalService, TeamLeaderParticipant } from '@/services/teamLeaderPortalService';
import { Card, CardContent } from '@/components/ui/shadcn/card';
import { Badge } from '@/components/ui/shadcn/badge';
import { Skeleton } from '@/components/ui/shadcn/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/shadcn/tabs';

export default function ParticipantsScreen() {
  const { context, loading: contextLoading } = useTeamLeaderContext();
  const [participants, setParticipants] = useState<TeamLeaderParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (!context) return;
    teamLeaderPortalService.getParticipants().then((data) => {
      setParticipants(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [context]);

  if (contextLoading || loading) {
    return (
      <TeamLeaderAppShell>
        <View style={{ gap: 12 }}>
          <Skeleton style={{ height: 40, borderRadius: 8 }} />
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} style={{ height: 60, borderRadius: 12 }} />
          ))}
        </View>
      </TeamLeaderAppShell>
    );
  }

  const filtered = filter === 'all' ? participants : participants.filter((p) => {
    if (filter === 'active') return p.status === 'active' || p.status === 'registered';
    if (filter === 'inactive') return p.status !== 'active' && p.status !== 'registered';
    return true;
  });

  return (
    <TeamLeaderAppShell>
      <View style={{ gap: 16 }}>
        <View>
          <Text style={{ fontSize: 20, fontWeight: '700', color: '#111827' }}>Participants</Text>
          <Text style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>
            View registered participants for your team
          </Text>
        </View>

        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList>
            <TabsTrigger value="all">All ({participants.length})</TabsTrigger>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="inactive">Inactive</TabsTrigger>
          </TabsList>

          <TabsContent value={filter}>
            {filtered.length === 0 ? (
              <Card>
                <CardContent style={{ padding: 24, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, color: '#64748B' }}>No participants found</Text>
                </CardContent>
              </Card>
            ) : (
              <View style={{ gap: 8 }}>
                {filtered.map((p) => (
                  <Card key={p.id}>
                    <CardContent style={{ padding: 12 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: '600', color: '#111827' }}>
                            {p.name || 'Participant'}
                          </Text>
                          <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                            {p.category_code && (
                              <Badge variant="outline">{p.category_code}</Badge>
                            )}
                            {p.gender && (
                              <Badge variant="secondary">{p.gender}</Badge>
                            )}
                            {p.chest_number && (
                              <Badge variant="info">Chest #{p.chest_number}</Badge>
                            )}
                          </View>
                        </View>
                        <Badge variant={p.status === 'active' || p.status === 'registered' ? 'success' : 'secondary'}>
                          {p.status || 'N/A'}
                        </Badge>
                      </View>
                    </CardContent>
                  </Card>
                ))}
              </View>
            )}
          </TabsContent>
        </Tabs>
      </View>
    </TeamLeaderAppShell>
  );
}
