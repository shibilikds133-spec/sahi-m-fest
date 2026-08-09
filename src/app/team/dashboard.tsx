import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useTeamLeaderContext } from '@/core/contexts/TeamLeaderContext';
import { TeamLeaderAppShell } from '@/components/layout/TeamLeaderAppShell';
import { teamLeaderPortalService, TeamLeaderScheduleRow, TeamLeaderPublishedResult, TeamLeaderAnnouncement } from '@/services/teamLeaderPortalService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/shadcn/card';
import { Badge } from '@/components/ui/shadcn/badge';
import { Skeleton } from '@/components/ui/shadcn/skeleton';

export default function TeamLeaderDashboard() {
  const { context, loading: contextLoading, error: contextError } = useTeamLeaderContext();
  const [schedule, setSchedule] = useState<TeamLeaderScheduleRow[]>([]);
  const [results, setResults] = useState<TeamLeaderPublishedResult[]>([]);
  const [announcements, setAnnouncements] = useState<TeamLeaderAnnouncement[]>([]);
  const [participantCount, setParticipantCount] = useState(0);
  useEffect(() => {
    if (!context) return;
    const load = async () => {
      try {
        const [s, r, a, p] = await Promise.all([
          teamLeaderPortalService.getSchedule(),
          teamLeaderPortalService.getPublishedResults(),
          teamLeaderPortalService.getAnnouncements(),
          teamLeaderPortalService.getParticipants(),
        ]);
        setSchedule(s);
        setResults(r);
        setAnnouncements(a);
        setParticipantCount(p.length);
      } catch (err) {
        console.error('Dashboard load error:', err);
      }
    };
    load();
  }, [context]);

  if (contextLoading) {
    return (
      <TeamLeaderAppShell>
        <View style={{ gap: 12 }}>
          <Skeleton style={{ height: 80, borderRadius: 12 }} />
          <Skeleton style={{ height: 120, borderRadius: 12 }} />
          <Skeleton style={{ height: 120, borderRadius: 12 }} />
        </View>
      </TeamLeaderAppShell>
    );
  }

  if (contextError || !context) {
    return (
      <TeamLeaderAppShell>
        <Card>
          <CardContent style={{ padding: 24, alignItems: 'center' }}>
            <Text style={{ fontSize: 14, color: 'hsl(var(--muted-foreground))', textAlign: 'center' }}>
              {contextError || 'Unable to load portal context. Please try again.'}
            </Text>
          </CardContent>
        </Card>
      </TeamLeaderAppShell>
    );
  }

  const upcomingEvents = schedule.slice(0, 5);
  const latestResults = results.slice(0, 5);
  const recentAnnouncements = announcements.slice(0, 3);
  const pendingCheckIns = schedule.reduce(
    (total, event) => total + Math.max(0, event.participant_count - event.checked_in_count),
    0,
  );
  const teamPrimary = context.portal_primary_color || '#0F766E';
  const teamAccent = context.portal_accent_color || '#14B8A6';

  return (
    <TeamLeaderAppShell>
      <View style={{ gap: 16 }}>
        {/* Branded hero */}
        <View style={{ padding: 20, borderRadius: 18, backgroundColor: teamPrimary, overflow: 'hidden' }}>
          <Text style={{ color: teamAccent, fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' }}>
            Team Leader Portal
          </Text>
          <Text style={{ color: '#FFFFFF', fontSize: 25, fontWeight: '800', marginTop: 6 }}>
            {context.team_name || 'Your Team'}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.78)', fontSize: 13, marginTop: 4 }}>
            {context.festival_name || 'Festival'} · Your team overview and updates
          </Text>
          <View style={{ alignSelf: 'flex-start', marginTop: 16, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: `${teamAccent}33`, borderWidth: 1, borderColor: `${teamAccent}88` }}>
            <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>LIVE TEAM SPACE</Text>
          </View>
        </View>

        {/* Summary Cards */}
        <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
          <Card style={{ flex: 1, minWidth: 150, borderLeftWidth: 4, borderLeftColor: teamPrimary }}>
            <CardContent style={{ padding: 16 }}>
              <Text style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>Participants</Text>
              <Text style={{ fontSize: 24, fontWeight: '700', color: teamPrimary, marginTop: 4 }}>
                {participantCount}
              </Text>
            </CardContent>
          </Card>
          <Card style={{ flex: 1, minWidth: 150, borderLeftWidth: 4, borderLeftColor: teamAccent }}>
            <CardContent style={{ padding: 16 }}>
              <Text style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>Upcoming Events</Text>
              <Text style={{ fontSize: 24, fontWeight: '700', color: teamPrimary, marginTop: 4 }}>
                {upcomingEvents.length}
              </Text>
            </CardContent>
          </Card>
          <Card style={{ flex: 1, minWidth: 150, borderLeftWidth: 4, borderLeftColor: teamPrimary }}>
            <CardContent style={{ padding: 16 }}>
              <Text style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>Published Results</Text>
              <Text style={{ fontSize: 24, fontWeight: '700', color: teamPrimary, marginTop: 4 }}>
                {latestResults.length}
              </Text>
            </CardContent>
          </Card>
          <Card style={{ flex: 1, minWidth: 150, borderLeftWidth: 4, borderLeftColor: teamAccent }}>
            <CardContent style={{ padding: 16 }}>
              <Text style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>Pending Check-ins</Text>
              <Text style={{ fontSize: 24, fontWeight: '700', color: teamPrimary, marginTop: 4 }}>
                {pendingCheckIns}
              </Text>
            </CardContent>
          </Card>
          <Card style={{ flex: 1, minWidth: 150, borderLeftWidth: 4, borderLeftColor: teamPrimary }}>
            <CardContent style={{ padding: 16 }}>
              <Text style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>Announcements</Text>
              <Text style={{ fontSize: 24, fontWeight: '700', color: teamPrimary, marginTop: 4 }}>
                {announcements.length}
              </Text>
            </CardContent>
          </Card>
        </View>

        {/* Upcoming Events */}
        <Card>
          <CardHeader>
            <CardTitle>Upcoming Competitions</CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingEvents.length === 0 ? (
              <Text style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', textAlign: 'center', padding: 16 }}>
                No upcoming competitions
              </Text>
            ) : (
              <View style={{ gap: 8 }}>
                {upcomingEvents.map((event) => (
                  <View
                    key={event.schedule_id}
                    style={{
                      padding: 12,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: 'hsl(var(--border))',
                      backgroundColor: 'hsl(var(--muted))',
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: 'hsl(var(--foreground))' }}>
                        {event.item_name || event.item_code || 'Competition'}
                      </Text>
                      <Badge variant={event.event_status === 'completed' ? 'secondary' : 'info'}>
                        {event.event_status || 'scheduled'}
                      </Badge>
                    </View>
                    <Text style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: 4 }}>
                      {event.start_time ? new Date(event.start_time).toLocaleDateString() : ''}
                      {event.start_time ? ` · ${new Date(event.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                      {event.venue_name ? ` · ${event.venue_name}` : ''}
                    </Text>
                    <Text style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: 2 }}>
                      {event.participant_count} participant{event.participant_count !== 1 ? 's' : ''} · {event.checked_in_count} checked in
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </CardContent>
        </Card>

        {/* Latest Results */}
        <Card>
          <CardHeader>
            <CardTitle>Latest Results</CardTitle>
          </CardHeader>
          <CardContent>
            {latestResults.length === 0 ? (
              <Text style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', textAlign: 'center', padding: 16 }}>
                No published results yet
              </Text>
            ) : (
              <View style={{ gap: 8 }}>
                {latestResults.map((result) => (
                  <View
                    key={result.result_id}
                    style={{
                      padding: 12,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: 'hsl(var(--border))',
                      backgroundColor: 'hsl(var(--muted))',
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: 'hsl(var(--foreground))' }}>
                        {result.item_name || result.item_code || 'Item'}
                      </Text>
                      {result.rank != null && (
                        <Badge variant={result.rank <= 3 ? 'success' : 'secondary'}>
                          #{result.rank}
                        </Badge>
                      )}
                    </View>
                    <Text style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: 4 }}>
                      {result.participant_name || 'Participant'}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                      {result.grade && (
                        <Badge variant="outline">Grade: {result.grade}</Badge>
                      )}
                      {result.points_awarded != null && (
                        <Badge variant="outline">{result.points_awarded} pts</Badge>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </CardContent>
        </Card>

        {/* Announcements */}
        <Card>
          <CardHeader>
            <CardTitle>Announcements</CardTitle>
          </CardHeader>
          <CardContent>
            {recentAnnouncements.length === 0 ? (
              <Text style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', textAlign: 'center', padding: 16 }}>
                No announcements
              </Text>
            ) : (
              <View style={{ gap: 8 }}>
                {recentAnnouncements.map((ann) => (
                  <View
                    key={ann.id}
                    style={{
                      padding: 12,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: 'hsl(var(--border))',
                      backgroundColor: 'hsl(var(--muted))',
                    }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '600', color: 'hsl(var(--foreground))' }}>
                      {ann.title || 'Notice'}
                    </Text>
                    <Text style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: 4 }} numberOfLines={2}>
                      {ann.message || ''}
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
