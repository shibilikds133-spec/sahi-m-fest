import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { AdminAppShell } from '@/components/layout/AdminAppShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/shadcn/card';
import { Badge } from '@/components/ui/shadcn/badge';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { Label } from '@/components/ui/shadcn/label';
import { Skeleton } from '@/components/ui/shadcn/skeleton';
import { supabase } from '@/core/config/supabase';
import { CheckCircle, ChevronLeft, Loader2, Plus, Search, Trash2, UserPlus, Users, XCircle } from 'lucide-react-native';

interface Assignment {
  id: string;
  leader_user_id: string;
  organisation_id: string;
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

      // Load assignments with team info
      const { data: assignmentsData, error: assignmentsError } = await supabase
        .from('team_leader_assignments')
        .select(`
          id,
          leader_user_id,
          organisation_id,
          created_at,
          organisations(name),
          profiles!team_leader_assignments_leader_user_id_fkey(display_name, email)
        `);

      if (assignmentsError) throw assignmentsError;

      const formatted = (assignmentsData || []).map((a: any) => ({
        id: a.id,
        leader_user_id: a.leader_user_id,
        organisation_id: a.organisation_id,
        team_name: a.organisations?.name || 'Unknown Team',
        leader_email: a.profiles?.email || 'N/A',
        leader_name: a.profiles?.display_name || a.profiles?.email || 'Unknown',
        created_at: a.created_at,
      }));

      setAssignments(formatted);

      // Load dropdown data
      const [usersResult, orgsResult] = await Promise.all([
        supabase.from('profiles').select('id, display_name, email').eq('role', 'participant'),
        supabase.from('organisations').select('id, name'),
      ]);

      setUsers(usersResult.data || []);
      setOrganisations(orgsResult.data || []);
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

      // Check for existing assignment
      const existing = assignments.find(
        (a) => a.leader_user_id === selectedUserId || a.organisation_id === selectedOrgId
      );

      if (existing) {
        Alert.alert('Conflict', 'This user or team already has a leader assignment.');
        return;
      }

      const { error } = await supabase.from('team_leader_assignments').insert({
        leader_user_id: selectedUserId,
        organisation_id: selectedOrgId,
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
    a.leader_email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <AdminAppShell>
      <ScrollView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ChevronLeft size={20} color="#374151" />
            <Text style={styles.backText}>Back to Settings</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Team Leader Portal</Text>
          <Text style={styles.subtitle}>Assign and manage team leaders</Text>
        </View>

        {/* Assign Form */}
        <Card style={styles.card}>
          <CardHeader>
            <CardTitle>Assign Team Leader</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingDropdowns ? (
              <Skeleton style={{ height: 100, borderRadius: 8 }} />
            ) : (
              <View style={styles.form}>
                <View style={styles.field}>
                  <Label>User</Label>
                  <View style={styles.selectWrapper}>
                    <TextInput
                      style={styles.select}
                      placeholder="Select a user"
                      placeholderTextColor="#94A3B8"
                      value={selectedUserId}
                      onChangeText={setSelectedUserId}
                    />
                  </View>
                  {users.length > 0 && (
                    <View style={styles.dropdownList}>
                      {users.slice(0, 10).map((u) => (
                        <TouchableOpacity
                          key={u.id}
                          style={[
                            styles.dropdownItem,
                            selectedUserId === u.id && styles.dropdownItemSelected,
                          ]}
                          onPress={() => setSelectedUserId(u.id)}
                        >
                          <Text style={styles.dropdownText}>
                            {u.display_name || u.email}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>

                <View style={styles.field}>
                  <Label>Team (Organisation)</Label>
                  <View style={styles.selectWrapper}>
                    <TextInput
                      style={styles.select}
                      placeholder="Select a team"
                      placeholderTextColor="#94A3B8"
                      value={selectedOrgId}
                      onChangeText={setSelectedOrgId}
                    />
                  </View>
                  {organisations.length > 0 && (
                    <View style={styles.dropdownList}>
                      {organisations.slice(0, 10).map((o) => (
                        <TouchableOpacity
                          key={o.id}
                          style={[
                            styles.dropdownItem,
                            selectedOrgId === o.id && styles.dropdownItemSelected,
                          ]}
                          onPress={() => setSelectedOrgId(o.id)}
                        >
                          <Text style={styles.dropdownText}>{o.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>

                <Button
                  onPress={handleAssign}
                  disabled={assigning || !selectedUserId || !selectedOrgId}
                  className="flex-row items-center justify-center"
                >
                  {assigning ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text className="text-white font-semibold text-sm">Assign</Text>
                  )}
                </Button>
              </View>
            )}
          </CardContent>
        </Card>

        {/* Assignments List */}
        <Card style={styles.card}>
          <CardHeader>
            <View style={styles.listHeader}>
              <CardTitle>Current Assignments</CardTitle>
              <Badge variant="secondary">{assignments.length}</Badge>
            </View>
          </CardHeader>
          <CardContent>
            {/* Search */}
            <View style={styles.searchWrapper}>
              <Search size={16} color="#94A3B8" />
              <TextInput
                style={styles.searchInput}
                placeholder="Search teams or leaders..."
                placeholderTextColor="#94A3B8"
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
              <View style={styles.emptyState}>
                <Users size={32} color="#94A3B8" />
                <Text style={styles.emptyText}>
                  {searchQuery ? 'No matching assignments found' : 'No team leaders assigned yet'}
                </Text>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                {filteredAssignments.map((assignment) => (
                  <View key={assignment.id} style={styles.assignmentRow}>
                    <View style={styles.assignmentInfo}>
                      <Text style={styles.assignmentTeam}>{assignment.team_name}</Text>
                      <Text style={styles.assignmentLeader}>
                        {assignment.leader_name} · {assignment.leader_email}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleRemove(assignment)}
                      style={styles.removeButton}
                    >
                      <Trash2 size={16} color="#DC2626" />
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  header: {
    marginBottom: 16,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  backText: {
    fontSize: 13,
    color: '#64748B',
    marginLeft: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  subtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  card: {
    marginBottom: 16,
  },
  form: {
    gap: 16,
  },
  field: {
    gap: 6,
  },
  selectWrapper: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
  },
  select: {
    height: 40,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#111827',
  },
  dropdownList: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    maxHeight: 150,
    overflow: 'hidden',
  },
  dropdownItem: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  dropdownItemSelected: {
    backgroundColor: '#F0FDFA',
  },
  dropdownText: {
    fontSize: 13,
    color: '#374151',
  },
  assignButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
    height: 40,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: '#111827',
  },
  emptyState: {
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 8,
  },
  assignmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    backgroundColor: '#FAFBFC',
  },
  assignmentInfo: {
    flex: 1,
  },
  assignmentTeam: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  assignmentLeader: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  removeButton: {
    padding: 8,
  },
});
