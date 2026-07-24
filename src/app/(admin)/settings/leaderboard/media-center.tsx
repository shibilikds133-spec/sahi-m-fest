import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator, Linking, Platform } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Download, RefreshCw, Share2, Archive } from 'lucide-react-native';
import { supabase } from '@/core/config/supabase';
import { useFestival } from '@/core/hooks/useFestival';
import { useExportQueueStore } from '@/services/exportQueueService';

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
  whatsapp: '#25D366'
};

export default function MediaCenterPage() {
  const { useActiveFestival } = useFestival();
  const { data: activeFestival } = useActiveFestival();
  const { jobs, isProcessing } = useExportQueueStore();
  const [filter, setFilter] = useState('all'); // 'all', 'poster', 'certificate'

  const { data: assets = [], isLoading, refetch } = useQuery({
    queryKey: ['generated-assets', activeFestival?.id],
    queryFn: async () => {
      if (!activeFestival?.id) return [];
      const { data, error } = await supabase
        .from('generated_assets')
        .select(`
          *,
          item:items(item_name_en, item_name_ml, item_type),
          result:results(public_result_no)
        `)
        .eq('festival_id', activeFestival.id)
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      
      // Group by render_hash (null-safe — each null gets its own unique key)
      const grouped = (data as any[]).reduce((acc, curr, idx) => {
        const key = curr.render_hash || `_ungrouped_${idx}`;
        if (!acc[key]) {
          acc[key] = {
            id: curr.id,
            render_hash: key,
            template_id: curr.template_id,
            event_name: curr.event_name || curr.item?.item_name_en || curr.item?.item_name_ml || 'Festival Event',
            result_no: curr.result?.public_result_no,
            created_at: curr.created_at,
            resolutions: {}
          };
        }
        acc[key].resolutions[curr.resolution] = curr.public_url;
        return acc;
      }, {} as Record<string, any>);
      
      return Object.values(grouped);
    },
    enabled: !!activeFestival?.id,
    refetchInterval: isProcessing ? 3000 : false, // Poll if queue is processing
  });

  const handleWhatsAppShare = (asset: any) => {
    // Generate text
    const text = `🏆 *${activeFestival?.custom_name || 'Sahithyolsav'} Result* 🏆\n\n` +
      `*Event:* ${asset.event_name}\n` +
      (asset.result_no ? `*Result No:* ${asset.result_no}\n` : '') +
      `\nView Poster: ${asset.resolutions?.share || asset.resolutions?.hd || asset.resolutions?.standard}\n` +
      `\nShared from Media Center`;

    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
    } else {
      Linking.openURL(url);
    }
  };

  const openUrl = (url: string) => {
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
    } else {
      Linking.openURL(url);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Media Center</Text>
          <Text style={styles.subtitle}>Manage and share generated assets</Text>
        </View>
        <View style={styles.headerActions}>
          {isProcessing && (
            <View style={styles.queueBadge}>
              <ActivityIndicator size="small" color={colors.navy} />
              <Text style={styles.queueText}>{jobs.length} Jobs Queued</Text>
            </View>
          )}
          <TouchableOpacity style={styles.btnSecondary} onPress={() => refetch()}>
            <RefreshCw size={16} color={colors.navy} />
            <Text style={styles.btnSecondaryText}>Refresh</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnPrimary}>
            <Archive size={16} color="#FFFFFF" />
            <Text style={styles.btnPrimaryText}>Batch Export (ZIP)</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {isLoading ? (
          <ActivityIndicator size="large" color={colors.navy} style={{ marginTop: 40 }} />
        ) : assets.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🗂️</Text>
            <Text style={styles.emptyTitle}>No assets generated yet</Text>
            <Text style={styles.emptySub}>Publish results in Poster Studio to see them here.</Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {assets.map((asset: any) => (
              <View key={asset.render_hash} style={styles.card}>
                <View style={styles.imageContainer}>
                  <Image 
                    source={{ uri: asset.resolutions?.thumb || asset.resolutions?.standard || asset.resolutions?.hd || 'https://via.placeholder.com/400' }} 
                    style={styles.thumbnail}
                    resizeMode="cover"
                  />
                  <View style={styles.qualityBadge}>
                    <Text style={styles.qualityText}>
                      {asset.resolutions?.hd ? '4K HD' : asset.resolutions?.standard ? 'HD' : 'Standard'}
                    </Text>
                  </View>
                </View>
                
                <View style={styles.cardBody}>
                  <Text style={styles.eventName} numberOfLines={1}>{asset.event_name}</Text>
                  <Text style={styles.metaText}>
                    {asset.result_no ? `Result #${asset.result_no}` : 'General Poster'} • {new Date(asset.created_at).toLocaleDateString()}
                  </Text>
                  
                  <View style={styles.actionsGrid}>
                    <TouchableOpacity 
                      style={[styles.actionBtn, !asset.resolutions?.hd && styles.actionBtnDisabled]}
                      onPress={() => asset.resolutions?.hd && openUrl(asset.resolutions.hd)}
                      disabled={!asset.resolutions?.hd}
                    >
                      <Download size={14} color={colors.navy} />
                      <Text style={styles.actionText}>HD PNG</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                      style={[styles.actionBtn, !asset.resolutions?.print && styles.actionBtnDisabled]}
                      onPress={() => asset.resolutions?.print && openUrl(asset.resolutions.print)}
                      disabled={!asset.resolutions?.print}
                    >
                      <Download size={14} color={colors.navy} />
                      <Text style={styles.actionText}>PDF</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                      style={styles.actionBtn}
                      onPress={() => {
                        const url = asset.resolutions?.share || asset.resolutions?.hd || asset.resolutions?.standard;
                        if(Platform.OS === 'web') {
                          navigator.clipboard.writeText(url);
                          alert('Link copied to clipboard!');
                        }
                      }}
                    >
                      <Share2 size={14} color={colors.navy} />
                      <Text style={styles.actionText}>Link</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                      style={[styles.actionBtn, styles.actionBtnWhatsApp]}
                      onPress={() => handleWhatsAppShare(asset)}
                    >
                      <Share2 size={14} color="#FFFFFF" />
                      <Text style={styles.actionTextWhatsApp}>Share</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.navy,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: colors.muted,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  queueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.soft,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 8,
  },
  queueText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.navy,
  },
  btnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  btnSecondaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.navy,
  },
  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.navy,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
  },
  btnPrimaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  scrollContent: {
    padding: 24,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 60,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.navy,
    marginBottom: 8,
  },
  emptySub: {
    fontSize: 14,
    color: colors.muted,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 20,
  },
  card: {
    width: 320,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: colors.navy,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  imageContainer: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: colors.bg,
    position: 'relative',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  qualityBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(11, 31, 58, 0.8)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backdropFilter: 'blur(4px)',
  },
  qualityText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  cardBody: {
    padding: 16,
  },
  eventName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.navy,
    marginBottom: 4,
  },
  metaText: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: 16,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    minWidth: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    backgroundColor: colors.bg,
    borderRadius: 6,
    gap: 6,
  },
  actionBtnDisabled: {
    opacity: 0.5,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.navy,
  },
  actionBtnWhatsApp: {
    backgroundColor: colors.whatsapp,
  },
  actionTextWhatsApp: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  }
});
