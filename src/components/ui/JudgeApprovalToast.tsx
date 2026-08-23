import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet } from 'react-native';
import { X, ShieldCheck, CheckCircle2 } from 'lucide-react-native';
import { supabase } from '../../core/config/supabase';
import { useAuthStore } from '../../core/store/authStore';
import { useRouter } from 'expo-router';

export const JudgeApprovalToast = () => {
  const { tenant_id } = useAuthStore();
  const [visible, setVisible] = useState(false);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [translateY] = useState(new Animated.Value(-100));
  const [currentNotif, setCurrentNotif] = useState<any>(null);
  const router = useRouter();

  useEffect(() => {
    if (!tenant_id) return;

    const channel = supabase
      .channel(`judge_approvals_global_${tenant_id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'judge_tokens',
          filter: `tenant_id=eq.${tenant_id}`,
        },
        async (payload) => {
          const { data: judgeData } = await supabase
            .from('judges')
            .select('name')
            .eq('id', payload.new.judge_id)
            .single();

          const judgeName = judgeData?.name || 'A judge';
          const deviceInfo = payload.new.device_info || 'Unknown Device';

          // Manual Approval Required
          if (payload.new.status === 'pending_approval' && payload.old.status !== 'pending_approval') {
            setCurrentNotif({
              type: 'waiting',
              title: 'Login Request',
              body: `${judgeName} is requesting login from ${deviceInfo}.`,
            });
            showToast();
            setTimeout(() => hideToast(), 8000);
          } 
          // Auto Approved by Device
          else if (payload.new.status === 'approved' && payload.old.status !== 'approved' && payload.old.status !== 'pending_approval') {
            setCurrentNotif({
              type: 'auto',
              title: 'Auto-Approved',
              body: `${judgeName} auto-logged in from trusted device (${deviceInfo}).`,
            });
            showToast();
            setTimeout(() => hideToast(), 6000);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenant_id]);

  const showToast = () => {
    setVisible(true);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  };

  const hideToast = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: -100, duration: 300, useNativeDriver: true }),
    ]).start(() => {
      setVisible(false);
      setCurrentNotif(null);
    });
  };

  if (!visible || !currentNotif) return null;

  const isAuto = currentNotif.type === 'auto';

  return (
    <Animated.View
      style={[styles.container, { opacity: fadeAnim, transform: [{ translateY }] }]}
      className={`absolute top-4 left-4 right-4 sm:top-6 sm:right-6 sm:left-auto sm:w-96 z-[9999] flex-row items-center p-4 rounded-xl border shadow-lg ${isAuto ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'}`}
    >
      <View className={`mr-3 p-2 rounded-full ${isAuto ? 'bg-green-100' : 'bg-blue-100'}`}>
        {isAuto ? <CheckCircle2 size={24} color="#16A34A" /> : <ShieldCheck size={24} color="#1D4ED8" />}
      </View>
      <View className="flex-1">
        <Text className={`font-poppins-bold text-sm ${isAuto ? 'text-green-900' : 'text-blue-900'}`}>{currentNotif.title}</Text>
        <Text className={`font-poppins-regular text-xs mt-0.5 ${isAuto ? 'text-green-800' : 'text-blue-800'}`}>{currentNotif.body}</Text>
      </View>
      
      {!isAuto && (
        <TouchableOpacity 
          onPress={() => {
            hideToast();
            router.push('/(admin)/judges');
          }} 
          className="bg-blue-600 px-3 py-1.5 rounded-lg ml-2"
        >
          <Text className="font-poppins-semibold text-white text-xs">View</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity onPress={hideToast} className="p-2 ml-1">
        <X size={18} color={isAuto ? "#166534" : "#1E3A8A"} />
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: { elevation: 6 },
});
