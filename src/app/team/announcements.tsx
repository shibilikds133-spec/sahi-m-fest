import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useTeamLeaderContext } from '@/core/contexts/TeamLeaderContext';
import { TeamLeaderAppShell } from '@/components/layout/TeamLeaderAppShell';
import { teamLeaderPortalService, TeamLeaderAnnouncement } from '@/services/teamLeaderPortalService';
import { Card, CardContent } from '@/components/ui/shadcn/card';
import { Badge } from '@/components/ui/shadcn/badge';
import { Skeleton } from '@/components/ui/shadcn/skeleton';

export default function AnnouncementsScreen() {
  const { context, loading: contextLoading } = useTeamLeaderContext();
  const [announcements, setAnnouncements] = useState<TeamLeaderAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!context) return;
    teamLeaderPortalService.getAnnouncements().then((data) => {
      setAnnouncements(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [context]);

  if (contextLoading || loading) {
    return (
      <TeamLeaderAppShell>
        <View style={{ gap: 12 }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} style={{ height: 100, borderRadius: 12 }} />
          ))}
        </View>
      </TeamLeaderAppShell>
    );
  }

  return (
    <TeamLeaderAppShell>
      <View style={{ gap: 16 }}>
        <View>
          <Text style={{ fontSize: 20, fontWeight: '700', color: '#111827' }}>Announcements</Text>
          <Text style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>
            Latest updates and notices
          </Text>
        </View>

        {announcements.length === 0 ? (
          <Card>
            <CardContent style={{ padding: 24, alignItems: 'center' }}>
              <Text style={{ fontSize: 13, color: '#64748B' }}>No announcements at this time</Text>
            </CardContent>
          </Card>
        ) : (
          <View style={{ gap: 12 }}>
            {announcements.map((ann) => (
              <Card key={ann.id}>
                <CardContent style={{ padding: 16 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: '#111827', flex: 1 }}>
                      {ann.title || 'Notice'}
                    </Text>
                    {ann.type && ann.type !== 'general' && (
                      <Badge variant="secondary">
                        {ann.type}
                      </Badge>
                    )}
                  </View>
                  <Text style={{ fontSize: 13, color: '#374151', marginTop: 8, lineHeight: 20 }}>
                    {ann.message || ''}
                  </Text>
                  {ann.created_at && (
                    <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 8 }}>
                      {new Date(ann.created_at).toLocaleString()}
                    </Text>
                  )}
                </CardContent>
              </Card>
            ))}
          </View>
        )}
      </View>
    </TeamLeaderAppShell>
  );
}
