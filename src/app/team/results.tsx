import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useTeamLeaderContext } from '@/core/contexts/TeamLeaderContext';
import { TeamLeaderAppShell } from '@/components/layout/TeamLeaderAppShell';
import { teamLeaderPortalService, TeamLeaderPublishedResult } from '@/services/teamLeaderPortalService';
import { Card, CardContent } from '@/components/ui/shadcn/card';
import { Badge } from '@/components/ui/shadcn/badge';
import { Skeleton } from '@/components/ui/shadcn/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/shadcn/tabs';

export default function ResultsScreen() {
  const { context, loading: contextLoading } = useTeamLeaderContext();
  const [results, setResults] = useState<TeamLeaderPublishedResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (!context) return;
    teamLeaderPortalService.getPublishedResults().then((data) => {
      setResults(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [context]);

  if (contextLoading || loading) {
    return (
      <TeamLeaderAppShell>
        <View style={{ gap: 12 }}>
          <Skeleton style={{ height: 40, borderRadius: 8 }} />
          <Skeleton style={{ height: 120, borderRadius: 12 }} />
          <Skeleton style={{ height: 120, borderRadius: 12 }} />
        </View>
      </TeamLeaderAppShell>
    );
  }

  const filtered = filter === 'all' ? results : results.filter((r) => {
    if (filter === 'medal') return r.rank != null && r.rank <= 3;
    return true;
  });

  return (
    <TeamLeaderAppShell>
      <View style={{ gap: 16 }}>
        <View>
          <Text style={{ fontSize: 20, fontWeight: '700', color: 'hsl(var(--foreground))' }}>Results</Text>
          <Text style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', marginTop: 2 }}>
            Published results for your team
          </Text>
        </View>

        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="medal">Medal Positions</TabsTrigger>
          </TabsList>

          <TabsContent value={filter}>
            {filtered.length === 0 ? (
              <Card>
                <CardContent style={{ padding: 24, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>No results to display</Text>
                </CardContent>
              </Card>
            ) : (
              <View style={{ gap: 8 }}>
                {filtered.map((result) => (
                  <Card key={result.result_id}>
                    <CardContent style={{ padding: 12 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: '600', color: 'hsl(var(--foreground))' }}>
                            {result.item_name || result.item_code || 'Item'}
                          </Text>
                          <Text style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: 2 }}>
                            {result.participant_name || 'Participant'}
                          </Text>
                          <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                            {result.rank != null && (
                              <Badge variant={result.rank <= 3 ? 'success' : 'outline'}>
                                #{result.rank}
                              </Badge>
                            )}
                            {result.grade && (
                              <Badge variant="outline">Grade: {result.grade}</Badge>
                            )}
                            {result.points_awarded != null && (
                              <Badge variant="info">{result.points_awarded} pts</Badge>
                            )}
                          </View>
                        </View>
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
