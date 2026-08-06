import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTeamLeaderContext } from '@/core/contexts/TeamLeaderContext';
import { TeamLeaderAppShell } from '@/components/layout/TeamLeaderAppShell';
import { teamLeaderPortalService, TeamLeaderScheduleRow } from '@/services/teamLeaderPortalService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/shadcn/card';
import { Badge } from '@/components/ui/shadcn/badge';
import { Button } from '@/components/ui/shadcn/button';
import { Skeleton } from '@/components/ui/shadcn/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/shadcn/tabs';

export default function ScheduleScreen() {
  const { context, loading: contextLoading } = useTeamLeaderContext();
  const [schedule, setSchedule] = useState<TeamLeaderScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const router = useRouter();

  useEffect(() => {
    if (!context) return;
    teamLeaderPortalService.getSchedule().then((data) => {
      setSchedule(data);
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

  const filtered = filter === 'all' ? schedule : schedule.filter((s) => s.event_status === filter);

  return (
    <TeamLeaderAppShell>
      <View style={{ gap: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={{ fontSize: 20, fontWeight: '700', color: '#111827' }}>Schedule</Text>
            <Text style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>
              Your team's event schedule
            </Text>
          </View>
          <Button variant="outline" size="sm" onPress={() => router.push('/team/schedule/full')}>
            Full Schedule
          </Button>
        </View>

        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="scheduled">Upcoming</TabsTrigger>
            <TabsTrigger value="ongoing">Live</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
          </TabsList>

          <TabsContent value={filter}>
            {filtered.length === 0 ? (
              <Card>
                <CardContent style={{ padding: 24, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, color: '#64748B' }}>No events found</Text>
                </CardContent>
              </Card>
            ) : (
              <View style={{ gap: 8 }}>
                {filtered.map((event) => (
                  <Card key={event.schedule_id}>
                    <CardContent style={{ padding: 12 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: '600', color: '#111827' }}>
                            {event.item_name || event.item_code || 'Event'}
                          </Text>
                          <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                            {event.start_time ? new Date(event.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                            {event.end_time ? ` - ${new Date(event.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                          </Text>
                          {event.venue_name && (
                            <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                              Venue: {event.venue_name}
                            </Text>
                          )}
                          <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                            {event.participant_count} participant{event.participant_count !== 1 ? 's' : ''} · {event.checked_in_count} checked in
                          </Text>
                        </View>
                        <Badge variant={event.event_status === 'completed' ? 'secondary' : event.event_status === 'ongoing' ? 'info' : 'outline'}>
                          {event.event_status || 'scheduled'}
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
