import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  RefreshCw,
  Search,
  X,
  Users,
  User as UserIcon,
} from 'lucide-react-native';
import { useFestival } from '../../../../core/hooks/useFestival';
import { useResultVisibility } from '../../../../core/hooks/useResultVisibility';
import { useAuthStore } from '../../../../core/store/authStore';
import { FestivalResult, ResultStatus } from '../../../../services/resultVisibilityService';

const colors = {
  navy: '#0B1F3A',
  blue: '#123B73',
  cyan: '#16B8D9',
  teal: '#0F766E',
  green: '#22C55E',
  bg: '#F3F8FB',
  card: '#FFFFFF',
  border: '#DDEAF1',
  text: '#0F172A',
  muted: '#64748B',
  soft: '#EAF7FA',
};

const STATUS_CONFIG: Record<ResultStatus, { label: string; bg: string; text: string }> = {
  draft:     { label: 'Draft',     bg: '#F1F5F9', text: '#475569' },
  ready:     { label: 'Ready',     bg: '#EFF6FF', text: '#1D4ED8' },
  published: { label: 'Published', bg: '#DCFCE7', text: '#15803D' },
  hidden:    { label: 'Hidden',    bg: '#FEE2E2', text: '#B91C1C' },
  archived:  { label: 'Archived',  bg: '#F3F4F6', text: '#374151' },
};

const ResultStatusBadge = ({ status }: { status: ResultStatus }) => {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  return (
    <View style={{ backgroundColor: cfg.bg, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' }}>
      <Text style={{ color: cfg.text, fontFamily: 'Poppins_700Bold', fontSize: 11 }}>{cfg.label}</Text>
    </View>
  );
};

const PublicVisibilityBadge = ({ visible }: { visible: boolean }) => (
  <View style={{
    backgroundColor: visible ? '#DCFCE7' : '#F1F5F9',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  }}>
    <Text style={{
      color: visible ? '#15803D' : '#475569',
      fontFamily: 'Poppins_700Bold',
      fontSize: 11,
    }}>
      {visible ? 'Public' : 'Public Hidden'}
    </Text>
  </View>
);

export interface ItemGroup {
  item_id: string;
  item_name: string;
  item_name_ml: string;
  is_group: boolean;
  results: FestivalResult[];
  status_summary: {
    published: number;
    ready: number;
    draft: number;
    hidden: number;
    archived: number;
    total: number;
  };
}

export default function ItemResultsPage() {
  const { tenant_id } = useAuthStore();

  // Load active festival ID
  const { useActiveFestival } = useFestival();
  const { data: activeFestival } = useActiveFestival();
  const festivalId = activeFestival?.id;

  // Load results
  const {
    results: festivalResults,
    error: resultsError,
    isLoading: isResultsLoading,
    isRefetching: isResultsRefetching,
    refetch: refetchResults,
    updateVisibility,
    bulkUpdateVisibility,
  } = useResultVisibility(tenant_id, festivalId);

  // Search & Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'LP' | 'UP' | 'HS' | 'HSS'>('all');
  const [resultTypeFilter, setResultTypeFilter] = useState<'all' | 'individual' | 'group'>('all');
  const [resultStatusFilter, setResultStatusFilter] = useState<'all' | ResultStatus>('all');
  const [previewGroup, setPreviewGroup] = useState<ItemGroup | null>(null);

  // Filtered results
  const filteredResults = useMemo(() => {
    return festivalResults.filter(r => {
      // 1. Type filter
      const typeMatch = resultTypeFilter === 'all'
        || (resultTypeFilter === 'individual' && !r.is_group)
        || (resultTypeFilter === 'group' && r.is_group);

      // 2. Status filter
      const statusMatch = resultStatusFilter === 'all'
        || r.result_status === resultStatusFilter;

      // 3. Category filter
      const categoryMatch = selectedCategory === 'all'
        || (r.item_name && r.item_name.toUpperCase().includes(selectedCategory.toUpperCase()))
        || (r.item_name_ml && r.item_name_ml.toUpperCase().includes(selectedCategory.toUpperCase()));

      // 4. Search query match
      const query = searchQuery.trim().toLowerCase();
      const searchMatch = !query
        || (r.item_name && r.item_name.toLowerCase().includes(query))
        || (r.item_name_ml && r.item_name_ml.toLowerCase().includes(query))
        || (r.organisation_name && r.organisation_name.toLowerCase().includes(query))
        || (r.participant_name && r.participant_name.toLowerCase().includes(query))
        || (r.chest_number && r.chest_number.toLowerCase().includes(query));

      return typeMatch && statusMatch && categoryMatch && searchMatch;
    });
  }, [festivalResults, resultTypeFilter, resultStatusFilter, selectedCategory, searchQuery]);

  // Grouped Results
  const groupedResults = useMemo(() => {
    const groups = new Map<string, ItemGroup>();
    filteredResults.forEach(r => {
      const groupId = r.item_id ?? `result:${r.result_id}`;
      if (!groups.has(groupId)) {
        groups.set(groupId, {
          item_id: groupId,
          item_name: r.item_name,
          item_name_ml: r.item_name_ml,
          is_group: r.is_group,
          results: [],
          status_summary: { published: 0, ready: 0, draft: 0, hidden: 0, archived: 0, total: 0 }
        });
      }
      const g = groups.get(groupId)!;
      g.results.push(r);
      const status = (r.result_status || 'draft') as ResultStatus;
      g.status_summary[status]++;
      g.status_summary.total++;
    });
    
    // Sort groups by item name
    return Array.from(groups.values()).sort((a, b) => {
      const nameA = a.item_name_ml || a.item_name;
      const nameB = b.item_name_ml || b.item_name;
      return nameA.localeCompare(nameB);
    });
  }, [filteredResults]);

  const handleItemBulkAction = async (group: ItemGroup, status: ResultStatus) => {
    const ids = group.results.map(r => r.result_id);
    if (!ids.length) return;
    try {
      await bulkUpdateVisibility.mutateAsync({ resultIds: ids, status });
    } catch (err: any) {
      alert('Error updating results: ' + err.message);
    }
  };

  const handleSingleVisibility = async (resultId: string, status: ResultStatus) => {
    try {
      await updateVisibility.mutateAsync({ resultId, status });
    } catch (err: any) {
      alert('Error updating result: ' + err.message);
    }
  };

  return (
    <View style={styles.tableCard}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>Result Visibility Management</Text>
          <Text style={styles.cardSubTitle}>Manage public visibility of results grouped by item.</Text>
        </View>
        <TouchableOpacity onPress={() => refetchResults()} style={styles.secondaryAction}>
          <RefreshCw size={16} color={colors.teal} />
          <Text style={styles.secondaryActionText}>{isResultsRefetching ? 'Refreshing' : 'Refresh'}</Text>
        </TouchableOpacity>
      </View>

      {/* Advanced Search & Filtering Bar */}
      <View style={styles.searchBarContainer}>
        <View style={styles.searchBox}>
          <Search size={18} color={colors.muted} style={{ marginRight: 8 }} />
          <TextInput
            placeholder="Search by item, participant, unit or chest no..."
            placeholderTextColor={colors.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={styles.searchInput}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <X size={16} color={colors.muted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filters */}
      <View style={styles.resultFilters}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          <View style={styles.chipRow}>
            {/* Categories */}
            {(['all', 'LP', 'UP', 'HS', 'HSS'] as const).map(cat => (
              <TouchableOpacity
                key={cat}
                onPress={() => setSelectedCategory(cat)}
                style={[styles.filterChip, selectedCategory === cat && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, selectedCategory === cat && styles.filterChipTextActive]}>
                  {cat === 'all' ? 'All Categories' : cat}
                </Text>
              </TouchableOpacity>
            ))}

            <View style={styles.filterDivider} />

            {/* Type filter */}
            {(['all', 'individual', 'group'] as const).map(t => (
              <TouchableOpacity
                key={t}
                onPress={() => setResultTypeFilter(t)}
                style={[styles.filterChip, resultTypeFilter === t && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, resultTypeFilter === t && styles.filterChipTextActive]}>
                  {t === 'all' ? 'All Types' : t === 'individual' ? '👤 Individual' : '👥 Group'}
                </Text>
              </TouchableOpacity>
            ))}

            <View style={styles.filterDivider} />

            {/* Status filter */}
            {(['all', 'published', 'ready', 'draft', 'hidden'] as const).map(s => (
              <TouchableOpacity
                key={s}
                onPress={() => setResultStatusFilter(s)}
                style={[styles.filterChip, resultStatusFilter === s && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, resultStatusFilter === s && styles.filterChipTextActive]}>
                  {s === 'all' ? 'All Status' : STATUS_CONFIG[s as ResultStatus]?.label ?? s}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Item Groups */}
      {isResultsLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.teal} />
          <Text style={styles.loadingText}>Loading item results...</Text>
        </View>
      ) : resultsError ? (
        <View style={styles.loadingBox}>
          <Text style={styles.errorText}>Unable to load admin results.</Text>
          <Text style={styles.loadingText}>{resultsError.message}</Text>
        </View>
      ) : groupedResults.length === 0 ? (
        <View style={styles.loadingBox}>
          <Text style={styles.loadingText}>No results found for selected filters.</Text>
        </View>
      ) : (
        <ScrollView style={styles.rowsScrollContainer}>
          {groupedResults.map(group => {
            const isAllPublished = group.status_summary.published === group.status_summary.total;
            const isAllPublic = group.results.every(r => r.public_visible === true);
            const isAllPublicHidden = group.results.every(r => r.public_visible !== true);
            const isAllReady = group.status_summary.ready === group.status_summary.total;
            
            let groupStatusText = 'Mixed Status';
            let groupStatusColor = '#F59E0B'; // Amber
            let groupStatusBg = '#FEF3C7';
            
            if (isAllPublished && isAllPublic) { groupStatusText = 'Public'; groupStatusColor = '#15803D'; groupStatusBg = '#DCFCE7'; }
            else if (isAllPublished && isAllPublicHidden) { groupStatusText = 'Admin Published'; groupStatusColor = '#1D4ED8'; groupStatusBg = '#DBEAFE'; }
            else if (isAllReady) { groupStatusText = 'All Ready'; groupStatusColor = '#1D4ED8'; groupStatusBg = '#DBEAFE'; }
            else if (group.status_summary.draft === group.status_summary.total) { groupStatusText = 'All Draft'; groupStatusColor = '#475569'; groupStatusBg = '#F1F5F9'; }

            return (
              <View key={group.item_id} style={styles.itemGroupCard}>
                {/* Item Group Header */}
                <View style={styles.itemGroupHeader}>
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <Text style={styles.itemGroupTitle}>{group.item_name_ml || group.item_name}</Text>
                    <View style={styles.itemTypeBadge}>
                      {group.is_group ? <Users size={12} color={colors.navy} style={{ marginRight: 4 }} /> : <UserIcon size={12} color={colors.navy} style={{ marginRight: 4 }} />}
                      <Text style={styles.itemTypeBadgeText}>{group.is_group ? 'Group' : 'Individual'}</Text>
                    </View>
                    <View style={[styles.itemGroupStatusBadge, { backgroundColor: groupStatusBg }]}>
                      <Text style={[styles.itemGroupStatusText, { color: groupStatusColor }]}>{groupStatusText}</Text>
                    </View>
                  </View>
                  
                  {/* Bulk Actions for Item */}
                  <View style={styles.itemGroupActions}>
                    <TouchableOpacity onPress={() => setPreviewGroup(group)} style={styles.bulkActionBtn}>
                      <Eye size={16} color={colors.navy} />
                      <Text style={styles.bulkActionBtnText}>Preview</Text>
                    </TouchableOpacity>
                    
                    {!isAllPublic && (
                      <TouchableOpacity onPress={() => handleItemBulkAction(group, 'published')} style={[styles.bulkActionBtn, { backgroundColor: '#DCFCE7', borderColor: '#BBF7D0' }]}>
                        <CheckCircle2 size={16} color="#15803D" />
                        <Text style={[styles.bulkActionBtnText, { color: '#15803D' }]}>Show Public</Text>
                      </TouchableOpacity>
                    )}
                    {!isAllPublicHidden && (
                      <TouchableOpacity onPress={() => handleItemBulkAction(group, 'hidden')} style={[styles.bulkActionBtn, { backgroundColor: '#FEE2E2', borderColor: '#FECACA' }]}>
                        <EyeOff size={16} color="#B91C1C" />
                        <Text style={[styles.bulkActionBtnText, { color: '#B91C1C' }]}>Hide Public</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                {/* nested participants */}
                <View style={styles.itemGroupParticipants}>
                  {group.results.sort((a, b) => (a.rank || 99) - (b.rank || 99)).map((r, i) => {
                    const status = (r.result_status ?? 'draft') as ResultStatus;
                    const isLast = i === group.results.length - 1;
                    return (
                      <View key={r.result_id} style={[styles.nestedResultRow, !isLast && { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }]}>
                        <View style={{ width: 24, alignItems: 'center' }}>
                          {r.rank ? <Text style={styles.nestedRankText}>#{r.rank}</Text> : <Text style={styles.nestedRankText}>-</Text>}
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={styles.nestedParticipantName} numberOfLines={1}>
                              {status === 'published' && r.participant_name ? r.participant_name : r.chest_number ? `Chest #${r.chest_number}` : '—'}
                            </Text>
                            <ResultStatusBadge status={status} />
                            <PublicVisibilityBadge visible={r.public_visible === true} />
                          </View>
                          <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
                            <Text style={styles.nestedMeta}>{r.organisation_name}</Text>
                            {r.grade && <Text style={styles.nestedMeta}>• {r.grade}</Text>}
                            <Text style={styles.nestedMeta}>• {r.points_awarded} pts</Text>
                          </View>
                        </View>
                        {/* Individual Overrides */}
                        <View style={styles.nestedActions}>
                           {r.public_visible !== true && (
                              <TouchableOpacity onPress={() => handleSingleVisibility(r.result_id, 'published')} style={[styles.nestedActionBtn, { backgroundColor: '#DCFCE7' }]}>
                                <CheckCircle2 size={14} color="#15803D" />
                              </TouchableOpacity>
                            )}
                            {status !== 'ready' && status !== 'published' && (
                              <TouchableOpacity onPress={() => handleSingleVisibility(r.result_id, 'ready')} style={[styles.nestedActionBtn, { backgroundColor: '#DBEAFE' }]}>
                                <Eye size={14} color="#1D4ED8" />
                              </TouchableOpacity>
                            )}
                            {r.public_visible === true && (
                              <TouchableOpacity onPress={() => handleSingleVisibility(r.result_id, 'hidden')} style={[styles.nestedActionBtn, { backgroundColor: '#FEE2E2' }]}>
                                <EyeOff size={14} color="#B91C1C" />
                              </TouchableOpacity>
                            )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Preview Modal */}
      <Modal
        visible={!!previewGroup}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewGroup(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setPreviewGroup(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            {previewGroup && (
              <>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <Text style={[styles.cardTitle, { fontSize: 18 }]}>Item Preview</Text>
                  <TouchableOpacity onPress={() => setPreviewGroup(null)}><X size={20} color={colors.muted} /></TouchableOpacity>
                </View>

                <View style={styles.previewHeaderCard}>
                   <Text style={styles.previewItemName}>{previewGroup.item_name_ml || previewGroup.item_name}</Text>
                   <Text style={styles.previewItemMeta}>{previewGroup.is_group ? 'Group Item' : 'Individual Item'} • {previewGroup.results.length} Results</Text>
                </View>

                <ScrollView style={{ maxHeight: 300, marginVertical: 16 }}>
                  {previewGroup.results.sort((a,b) => (a.rank||99) - (b.rank||99)).map(r => (
                    <View key={r.result_id} style={styles.previewResultRow}>
                       <View style={{ width: 28, alignItems: 'center', justifyContent: 'center' }}>
                         <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: 13, color: colors.navy }}>
                           {r.rank ? `#${r.rank}` : '-'}
                         </Text>
                       </View>
                       <View style={{ flex: 1 }}>
                         <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 13, color: colors.text }}>
                           {r.result_status === 'published' && r.participant_name ? r.participant_name : r.chest_number ? `Chest #${r.chest_number}` : '—'}
                         </Text>
                         <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 11, color: colors.muted }}>
                           {r.organisation_name}
                         </Text>
                       </View>
                       <View style={{ alignItems: 'flex-end' }}>
                         <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: 13, color: colors.teal }}>{r.points_awarded} pts</Text>
                         {r.grade && <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 11, color: colors.muted }}>Grade {r.grade}</Text>}
                       </View>
                    </View>
                  ))}
                </ScrollView>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity
                    style={[styles.primaryAction, { flex: 1 }]}
                    onPress={() => { handleItemBulkAction(previewGroup, 'published'); setPreviewGroup(null); }}
                  >
                    <CheckCircle2 size={16} color="#fff" />
                    <Text style={styles.primaryActionText}>Show Public</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={[styles.outlineAction, { flex: 1 }]}
                    onPress={() => { handleItemBulkAction(previewGroup, 'hidden'); setPreviewGroup(null); }}
                  >
                    <EyeOff size={16} color="#B91C1C" />
                    <Text style={[styles.outlineActionText, { color: '#B91C1C' }]}>Hide Public</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  tableCard: {
    backgroundColor: colors.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: '#0F2A45',
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    width: '100%',
  },
  cardHeader: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  cardTitle: {
    color: colors.text,
    fontFamily: 'Poppins_900Black',
    fontSize: 20,
  },
  cardSubTitle: {
    color: colors.muted,
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
    marginTop: 2,
  },
  secondaryAction: {
    height: 38,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#F8FCFD',
  },
  secondaryActionText: {
    color: colors.teal,
    fontFamily: 'Poppins_700Bold',
    fontSize: 12,
  },
  searchBarContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  searchBox: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#F6FAFC',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontFamily: 'Poppins_500Medium',
    fontSize: 13,
    padding: 0,
  },
  resultFilters: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterScroll: {
    alignItems: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  filterChip: {
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterChipActive: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
  },
  filterChipText: {
    color: colors.muted,
    fontFamily: 'Poppins_700Bold',
    fontSize: 11,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  filterDivider: {
    width: 1.5,
    height: 18,
    backgroundColor: colors.border,
    marginHorizontal: 4,
  },
  loadingBox: {
    paddingVertical: 56,
    alignItems: 'center',
  },
  loadingText: {
    color: colors.muted,
    fontFamily: 'Poppins_400Regular',
    fontSize: 13,
    marginTop: 10,
  },
  errorText: {
    color: '#B91C1C',
    fontFamily: 'Poppins_700Bold',
    fontSize: 13,
  },
  rowsScrollContainer: {
    maxHeight: 600,
  },
  itemGroupCard: {
    marginHorizontal: 20,
    marginVertical: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  itemGroupHeader: {
    backgroundColor: '#F8FAFC',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
  },
  itemGroupTitle: {
    color: colors.navy,
    fontFamily: 'Poppins_700Bold',
    fontSize: 16,
  },
  itemTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  itemTypeBadgeText: {
    color: colors.navy,
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 11,
  },
  itemGroupStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  itemGroupStatusText: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 11,
  },
  itemGroupActions: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  bulkActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  bulkActionBtnText: {
    color: colors.navy,
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 12,
  },
  itemGroupParticipants: {
    padding: 12,
  },
  nestedResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  nestedRankText: {
    color: colors.muted,
    fontFamily: 'Poppins_900Black',
    fontSize: 14,
  },
  nestedParticipantName: {
    color: colors.text,
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 13,
  },
  nestedMeta: {
    color: colors.muted,
    fontFamily: 'Poppins_500Medium',
    fontSize: 11,
  },
  nestedActions: {
    flexDirection: 'row',
    gap: 6,
  },
  nestedActionBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.48)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 460,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    shadowColor: '#0F2A45',
    shadowOpacity: 0.16,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
  },
  previewHeaderCard: {
    backgroundColor: '#F8FAFC',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  previewItemName: {
    color: colors.navy,
    fontFamily: 'Poppins_700Bold',
    fontSize: 16,
  },
  previewItemMeta: {
    color: colors.muted,
    fontFamily: 'Poppins_500Medium',
    fontSize: 12,
    marginTop: 2,
  },
  previewResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 12,
  },
  primaryAction: {
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.teal,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontFamily: 'Poppins_700Bold',
    fontSize: 13,
  },
  outlineAction: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  outlineActionText: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 13,
  },
});
