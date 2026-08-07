import React, { useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { AdminAppShell } from '@/components/layout/AdminAppShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/shadcn/card';
import { Badge } from '@/components/ui/shadcn/badge';
import { Button } from '@/components/ui/shadcn/button';
import { Label } from '@/components/ui/shadcn/label';
import { Skeleton } from '@/components/ui/shadcn/skeleton';
import { supabase } from '@/core/config/supabase';
import { ChevronLeft, Search, Trash2, Users } from 'lucide-react-native';

interface Assignment {
  id: string;
  user_id: string;
  festival_team_id: string;
  status: string;
  assigned_at: string;
  team_name: string;
  leader_email: string;
  leader_name: string;
  created_at: string;
}

export default function TeamLeaderPortalAdmin() {
  const router = useRouter();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [organisations, setOrganisations] = useState<any[]>([]);
  const [loadingDropdowns, setLoadingDropdowns] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load assignments with team info via festival_teams → organisations
      const { data: assignmentsData, error: assignmentsError } = await supabase
        .from('team_leader_assignments')
        .select(`
          id,
          user_id,
          festival_team_id,
          status,
          assigned_at,
          created_at,
          festival_teams!inner(
            organisation_id,
            organisations(name)
          )
        `)
        .eq('status', 'active');

      if (assignmentsError) throw assignmentsError;

      // Resolve leader profiles separately (PostgREST FK name varies)
      const userIds = (assignmentsData || []).map((a: any) => a.user_id).filter(Boolean);
      const { data: profilesData } = userIds.length > 0
        ? await supabase.from('profiles').select('id, display_name, email').in('id', userIds)
        : { data: [] };

      const profileMap = new Map((profilesData || []).map((p: any) => [p.id, p]));

      const formatted = (assignmentsData || []).map((a: any) => {
        const profile = profileMap.get(a.user_id);
        return {
          id: a.id,
          user_id: a.user_id,
          festival_team_id: a.festival_team_id,
          status: a.status,
          assigned_at: a.assigned_at,
          team_name: (a.festival_teams as any)?.organisations?.name || 'Unknown Team',
          leader_email: profile?.email || 'N/A',
          leader_name: profile?.display_name || profile?.email || 'Unknown',
          created_at: a.created_at,
        };
      });

      setAssignments(formatted);

      // Load dropdown data: users with team_leader role, and active festival teams
      const [usersResult, teamsResult] = await Promise.all([
        supabase.from('profiles').select('id, display_name, email').eq('role', 'team_leader'),
        supabase
          .from('festival_teams')
          .select('id, organisation_id, organisations(name), festival_id, is_active')
          .eq('is_active', true),
      ]);

      setUsers(usersResult.data || []);
      setOrganisations(
        (teamsResult.data || []).map((t: any) => ({
          id: t.id,
          name: `${t.organisations?.name || 'Unknown'} (Team)`,
          organisation_id: t.organisation_id,
          festival_id: t.festival_id,
        }))
      );
    } catch (error) {
      console.error('Error loading data:', error);
      Alert.alert('Error', 'Failed to load team leader data.');
    } finally {
      setLoading(false);
      setLoadingDropdowns(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedUserId || !selectedOrgId) {
      Alert.alert('Validation', 'Please select both a user and a team.');
      return;
    }

    try {
      setAssigning(true);

      // Check for existing active assignment for this user in any festival team
      const existing = assignments.find(
        (a) => a.user_id === selectedUserId
      );

      if (existing) {
        Alert.alert('Conflict', 'This user already has a team leader assignment.');
        return;
      }

      const { error } = await supabase.from('team_leader_assignments').insert({
        user_id: selectedUserId,
        festival_team_id: selectedOrgId,
        status: 'active',
      });

      if (error) throw error;

      Alert.alert('Success', 'Team leader assigned successfully.');
      setSelectedUserId('');
      setSelectedOrgId('');
      loadData();
    } catch (error) {
      console.error('Error assigning:', error);
      Alert.alert('Error', 'Failed to assign team leader.');
    } finally {
      setAssigning(false);
    }
  };

  const handleRemove = (assignment: Assignment) => {
    Alert.alert(
      'Remove Assignment',
      `Remove ${assignment.leader_name} from ${assignment.team_name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('team_leader_assignments')
                .delete()
                .eq('id', assignment.id);
              if (error) throw error;
              loadData();
            } catch (error) {
              Alert.alert('Error', 'Failed to remove assignment.');
            }
          },
        },
      ]
    );
  };

  const filteredAssignments = assignments.filter((a) =>
    a.team_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.leader_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.leader_email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.status.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <AdminAppShell>
      <ScrollView style={{ flex: 1, padding: 16 }}>
        {/* Header */}
        <View style={{ marginBottom: 16 }}>
          <TouchableOpacity onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <ChevronLeft size={20} color="hsl(var(--foreground))" />
            <Text style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', marginLeft: 4 }}>Back to Settings</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 20, fontWeight: '700', color: 'hsl(var(--foreground))' }}>Team Leader Portal</Text>
          <Text style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', marginTop: 2 }}>
            Assign and manage team leaders
          </Text>
        </View>

        {/* Assign Form */}
        <Card style={{ marginBottom: 16 }}>
          <CardHeader>
            <CardTitle>Assign Team Leader</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingDropdowns ? (
              <Skeleton style={{ height: 100, borderRadius: 8 }} />
            ) : (
              <View style={{ gap: 16 }}>
                <View style={{ gap: 6 }}>
                  <Label>User</Label>
                  <View style={{ borderWidth: 1, borderColor: 'hsl(var(--input))', borderRadius: 8 }}>
                    <TextInput
                      style={{ height: 40, paddingHorizontal: 12, fontSize: 14, color: 'hsl(var(--foreground))' }}
                      placeholder="Select a user"
                      placeholderTextColor="hsl(var(--muted-foreground))"
                      value={selectedUserId}
                      onChangeText={setSelectedUserId}
                    />
                  </View>
                  {users.length > 0 && (
                    <View style={{ borderWidth: 1, borderColor: 'hsl(var(--input))', borderRadius: 8, maxHeight: 150, overflow: 'hidden' }}>
                      {users.slice(0, 10).map((u) => (
                        <TouchableOpacity
                          key={u.id}
                          style={{
                            padding: 10,
                            borderBottomWidth: 1,
                            borderBottomColor: 'hsl(var(--border))',
                            backgroundColor: selectedUserId === u.id ? 'hsl(var(--accent))' : 'transparent',
                          }}
                          onPress={() => setSelectedUserId(u.id)}
                        >
                          <Text style={{ fontSize: 13, color: 'hsl(var(--foreground))' }}>
                            {u.display_name || u.email}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>

                <View style={{ gap: 6 }}>
                  <Label>Team (Organisation)</Label>
                  <View style={{ borderWidth: 1, borderColor: 'hsl(var(--input))', borderRadius: 8 }}>
                    <TextInput
                      style={{ height: 40, paddingHorizontal: 12, fontSize: 14, color: 'hsl(var(--foreground))' }}
                      placeholder="Select a team"
                      placeholderTextColor="hsl(var(--muted-foreground))"
                      value={selectedOrgId}
                      onChangeText={setSelectedOrgId}
                    />
                  </View>
                  {organisations.length > 0 && (
                    <View style={{ borderWidth: 1, borderColor: 'hsl(var(--input))', borderRadius: 8, maxHeight: 150, overflow: 'hidden' }}>
                      {organisations.slice(0, 10).map((o) => (
                        <TouchableOpacity
                          key={o.id}
                          style={{
                            padding: 10,
                            borderBottomWidth: 1,
                            borderBottomColor: 'hsl(var(--border))',
                            backgroundColor: selectedOrgId === o.id ? 'hsl(var(--accent))' : 'transparent',
                          }}
                          onPress={() => setSelectedOrgId(o.id)}
                        >
                          <Text style={{ fontSize: 13, color: 'hsl(var(--foreground))' }}>{o.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>

                <Button
                  onPress={handleAssign}
                  disabled={assigning || !selectedUserId || !selectedOrgId}
                  loading={assigning}
                >
                  Assign
                </Button>
              </View>
            )}
          </CardContent>
        </Card>

        {/* Assignments List */}
        <Card>
          <CardHeader>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <CardTitle>Current Assignments</CardTitle>
              <Badge variant="secondary">{assignments.length}</Badge>
            </View>
          </CardHeader>
          <CardContent>
            {/* Search */}
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              borderWidth: 1,
              borderColor: 'hsl(var(--input))',
              borderRadius: 8,
              paddingHorizontal: 12,
              marginBottom: 12,
              height: 40,
            }}>
              <Search size={16} color="hsl(var(--muted-foreground))" />
              <TextInput
                style={{ flex: 1, marginLeft: 8, fontSize: 14, color: 'hsl(var(--foreground))' }}
                placeholder="Search teams or leaders..."
                placeholderTextColor="hsl(var(--muted-foreground))"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>

            {loading ? (
              <View style={{ gap: 8 }}>
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} style={{ height: 60, borderRadius: 8 }} />
                ))}
              </View>
            ) : filteredAssignments.length === 0 ? (
              <View style={{ alignItems: 'center', padding: 24 }}>
                <Users size={32} color="hsl(var(--muted-foreground))" />
                <Text style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', marginTop: 8 }}>
                  {searchQuery ? 'No matching assignments found' : 'No team leaders assigned yet'}
                </Text>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                {filteredAssignments.map((assignment) => (
                  <View
                    key={assignment.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      padding: 12,
                      borderWidth: 1,
                      borderColor: 'hsl(var(--border))',
                      borderRadius: 8,
                      backgroundColor: 'hsl(var(--muted))',
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: 'hsl(var(--foreground))' }}>
                        {assignment.team_name}
                      </Text>
                      <Text style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: 2 }}>
                        {assignment.leader_name} · {assignment.leader_email}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleRemove(assignment)}
                      style={{ padding: 8 }}
                    >
                      <Trash2 size={16} color="hsl(var(--destructive))" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </CardContent>
        </Card>
      </ScrollView>
    </AdminAppShell>
  );
}
