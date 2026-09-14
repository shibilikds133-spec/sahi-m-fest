import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable, ScrollView, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { RefreshCcw, Radio, Trophy, CheckCircle, QrCode, Copy, Share, ExternalLink } from 'lucide-react-native';
import { Modal, Platform } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SsfButton } from '@/components/ui/SsfButton';
import { supabase } from '@/core/config/supabase';
import { useAuthStore } from '@/core/store/authStore';
import { useFestival } from '@/core/hooks/useFestival';
import { ui } from '@/constants/designSystem';


interface StrategicResult {
  result_id: string;
  item_name: string;
  suspense_score: number;
  recommended_order: number;
  new_1st_points: number;
  new_2nd_points: number;
  new_3rd_points: number;
  leader_name: string;
}

export default function SmartAnnouncerPage() {
  const { user } = useAuthStore();
  const { useActiveFestival } = useFestival();
  const { data: currentFestival, isLoading: festivalLoading } = useActiveFestival();
  const [results, setResults] = useState<StrategicResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
  const [announcerToken, setAnnouncerToken] = useState<string | null>(null);
  const [generatingToken, setGeneratingToken] = useState(false);


  
  const handleGenerateToken = async () => {
    if (!currentFestival?.id || !user?.tenant_id) return;
    setGeneratingToken(true);
    try {
      // Check if active token exists
      const { data: existing } = await supabase
        .from('announcer_tokens')
        .select('token')
        .eq('festival_id', currentFestival.id)
        .eq('is_active', true)
        .single();
        
      if (existing?.token) {
        setAnnouncerToken(existing.token);
      } else {
        // Generate new token (6 chars)
        const newToken = Math.random().toString(36).substring(2, 8).toUpperCase();
        const { error } = await supabase
          .from('announcer_tokens')
          .insert({
            tenant_id: user.tenant_id,
            festival_id: currentFestival.id,
            token: newToken,
            created_by: user.id
          });
        if (error) throw error;
        setAnnouncerToken(newToken);
      }
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Could not generate announcer token.");
    } finally {
      setGeneratingToken(false);
    }
  };

  const openTokenModal = () => {
    setIsTokenModalOpen(true);
    handleGenerateToken();
  };

  const fetchQueue = async () => {
    if (!currentFestival || !user?.tenant_id) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_strategic_publish_order', {
        p_festival_id: currentFestival.id,
        p_tenant_id: user.tenant_id
      });
      if (error) throw error;
      setResults(data || []);
    } catch (err: any) {
      console.error('Error fetching queue:', err);
      Alert.alert("Error", "Could not fetch the smart queue. Please check if the Suspense RPC is deployed.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, [currentFestival]);

  
  const handlePublish = async (resultId: string, itemName: string) => {
    Alert.alert(
      "Publish Result",
      `Are you sure you want to publish the result for ${itemName}? This will immediately update the public leaderboard.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Publish",
          style: "default",
          onPress: async () => {
            setPublishing(resultId);
            try {
              const { error } = await supabase
                .from('results')
                .update({ public_visible: true, published_at: new Date().toISOString() })
                .eq('item_id', resultId);
              
              if (error) throw error;
              
              Alert.alert("Success", "Result published successfully!");
              fetchQueue();
            } catch (err) {
              console.error(err);
              Alert.alert("Error", "Failed to publish result.");
            } finally {
              setPublishing(null);
            }
          }
        }
      ]
    );
  };

  const handleHide = async (resultId: string, itemName: string) => {
    Alert.alert(
      "Hide Result",
      `Are you sure you want to hide the result for ${itemName} from the public leaderboard?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Hide",
          style: "destructive",
          onPress: async () => {
            setPublishing(resultId);
            try {
              const { error } = await supabase
                .from('results')
                .update({ public_visible: false })
                .eq('item_id', resultId);
              
              if (error) throw error;
              
              Alert.alert("Success", "Result hidden successfully!");
              fetchQueue();
            } catch (err) {
              console.error(err);
              Alert.alert("Error", "Failed to hide result.");
            } finally {
              setPublishing(null);
            }
          }
        }
      ]
    );
  };
  

  return (
    <>
      <Stack.Screen options={{ title: 'Smart Announcer' }} />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Smart Announcer Queue</Text>
            <Text style={styles.subtitle}>Strategically publish results to maintain leaderboard suspense</Text>
          </View>
          <TouchableOpacity 
            style={[styles.refreshBtn, loading && styles.disabledBtn]} 
            onPress={fetchQueue}
            disabled={loading}
          >
            <RefreshCcw size={20} color="white" />
            <Text style={styles.refreshText}>Recalculate</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color={ui.colors.primary} />
            <Text style={styles.loaderText}>Analyzing suspense impact...</Text>
          </View>
        ) : results.length === 0 ? (
          <View style={styles.loader}>
            <Radio size={48} color={ui.colors.textSubtle} />
            <Text style={[styles.title, { marginTop: 16 }]}>Queue Empty</Text>
            <Text style={styles.subtitle}>No pending results to announce. All approved results have been published.</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {results.map((res, index) => {
              const isTop = index === 0;
              return (
                <View key={res.result_id} style={[styles.card, isTop && styles.topCard]}>
                  {isTop && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>🔥 Recommended Next</Text>
                    </View>
                  )}
                  <View style={styles.cardHeader}>
                    <Text style={styles.itemName}>{res.item_name}</Text>
                    <Text style={styles.orderText}>Order: {res.recommended_order}</Text>
                  </View>
                  
                  <View style={styles.impactContainer}>
                    <Text style={styles.impactTitle}>If published, Leaderboard will be:</Text>
                    <View style={styles.statsRow}>
                      <View style={styles.statBox}>
                        <Trophy size={16} color="#fbbf24" />
                        <Text style={styles.statLabel}>1st Place</Text>
                        <Text style={styles.statValue}>{res.new_1st_points} pts</Text>
                      </View>
                      <View style={styles.statBox}>
                        <Trophy size={16} color={ui.colors.textSubtle} />
                        <Text style={styles.statLabel}>2nd Place</Text>
                        <Text style={styles.statValue}>{res.new_2nd_points} pts</Text>
                      </View>
                      <View style={styles.statBox}>
                        <Trophy size={16} color="#b45309" />
                        <Text style={styles.statLabel}>3rd Place</Text>
                        <Text style={styles.statValue}>{res.new_3rd_points} pts</Text>
                      </View>
                    </View>
                    <Text style={styles.leaderText}>
                      Leader will be: <Text style={styles.leaderHighlight}>{res.leader_name}</Text> (Suspense Score: {res.suspense_score})
                    </Text>
                  </View>

                  <TouchableOpacity 
                    style={[styles.publishBtn, publishing === res.result_id && styles.disabledBtn]}
                    onPress={() => handlePublish(res.result_id, res.item_name)}
                    disabled={publishing === res.result_id}
                  >
                    {publishing === res.result_id ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <>
                        <CheckCircle size={18} color="white" />
                        <Text style={styles.publishText}>Announce & Publish</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}
      
      {/* QR Code Modal */}
      <Modal visible={isTokenModalOpen} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <View style={{ width: '100%', maxWidth: 400, backgroundColor: 'white', borderRadius: 16, padding: 24 }}>
            <Text style={{ fontSize: 20, fontFamily: 'Poppins_900Black', color: '#1e293b', marginBottom: 16 }}>Announcer Access</Text>
            
            {generatingToken ? (
              <ActivityIndicator size="large" color="#0f766e" style={{ marginVertical: 32 }} />
            ) : announcerToken ? (
              <View style={{ alignItems: 'center' }}>
                <View style={{ padding: 16, backgroundColor: 'white', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 16 }}>
                  <QRCode
                    value={typeof window !== 'undefined' ? `${window.location.origin}/announcer/${announcerToken}` : `https://sahi-app.com/announcer/${announcerToken}`}
                    size={160}
                    color="#0f766e"
                    backgroundColor="white"
                  />
                </View>
                <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>Access Code</Text>
                <Text style={{ fontFamily: 'Poppins_900Black', fontSize: 28, color: '#0f766e', letterSpacing: 4, marginBottom: 24 }}>{announcerToken}</Text>
                
                <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: '#64748b', textAlign: 'center', marginBottom: 24 }}>
                  Scan this QR code or use the link to access the Announcer Portal. No login required.
                </Text>
              </View>
            ) : null}
            
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
              <SsfButton label="Close" variant="outline" onPress={() => setIsTokenModalOpen(false)} />
            </View>
          </View>
        </View>
      </Modal>
  
</ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    gap: 24,
    maxWidth: 1000,
    marginHorizontal: 'auto',
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: ui.colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: ui.colors.textMuted,
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: ui.colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
  },
  disabledBtn: {
    opacity: 0.7,
  },
  refreshText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  loader: {
    padding: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loaderText: {
    color: ui.colors.textMuted,
    fontSize: 16,
  },
  list: {
    gap: 16,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: ui.colors.border,
    shadowColor: ui.shadow.shadowColor,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  topCard: {
    borderColor: ui.colors.primary,
    borderWidth: 2,
  },
  badge: {
    backgroundColor: ui.colors.primary,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
    marginBottom: 12,
  },
  badgeText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  itemName: {
    fontSize: 20,
    fontWeight: '700',
    color: ui.colors.text,
  },
  orderText: {
    fontSize: 14,
    fontWeight: '600',
    color: ui.colors.textMuted,
    backgroundColor: ui.colors.surfaceStrong,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 100,
  },
  impactContainer: {
    backgroundColor: ui.colors.surfaceMuted,
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
  },
  impactTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: ui.colors.text,
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  statBox: {
    flex: 1,
    minWidth: 100,
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: ui.colors.border,
    alignItems: 'center',
    gap: 4,
  },
  statLabel: {
    fontSize: 12,
    color: ui.colors.textMuted,
    fontWeight: '500',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: ui.colors.text,
  },
  leaderText: {
    fontSize: 14,
    color: ui.colors.textMuted,
    textAlign: 'center',
  },
  leaderHighlight: {
    fontWeight: '700',
    color: ui.colors.text,
  },
  publishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ui.colors.text,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  publishText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
});
