import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { SsfCard } from '../../../components/ui/SsfCard';
import { SsfButton } from '../../../components/ui/SsfButton';
import Animated, { FadeInUp, FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Calendar, Award, CheckSquare, Layers, BarChart3 } from 'lucide-react-native';

export default function SettingsMenu() {
  const router = useRouter();

  const menuItems = [
    {
      title: 'Festival Calendar',
      desc: 'Set festival dates and registration deadlines',
      icon: <Calendar size={24} color="#065F46" />,
      route: '/(admin)/settings/calendar',
      delay: 200
    },
    {
      title: 'Item Activation',
      desc: 'Enable/Disable 183 items from handbook',
      icon: <CheckSquare size={24} color="#D4AF37" />,
      route: '/(admin)/settings/items',
      delay: 300
    },
    {
      title: 'Points & Grading',
      desc: 'Configure scoring rules and grade points',
      icon: <Award size={24} color="#065F46" />,
      route: '/(admin)/settings/points',
      delay: 400
    },
    {
      title: 'Scoring Rules',
      desc: 'Configure item criteria and marks',
      icon: <Layers size={24} color="#065F46" />,
      route: '/(admin)/settings/scoring-rules',
      delay: 500
    },
    {
      title: 'Leaderboard Management',
      desc: 'Control unit rankings, live updates, and public publishing',
      icon: <BarChart3 size={24} color="#0891B2" />,
      route: '/(admin)/settings/leaderboard',
      delay: 600
    },
    {
      title: 'AI Settings & API Keys',
      desc: 'Manage Gemini, Llama, OpenAI keys for chatbot',
      icon: <CheckSquare size={24} color="#3b82f6" />,
      route: '/(admin)/settings/api-keys',
      delay: 700
    }
  ];

  return (
    <View className="flex-1 bg-ssf-bg">
      <LinearGradient 
        colors={['#065F46', '#044230']}
        className="pt-16 pb-12 px-6 rounded-b-[40px] shadow-sm mb-6"
      >
        <Text className="text-3xl font-poppins-black text-white">Settings</Text>
        <Text className="text-ssf-surface opacity-80 font-poppins mt-1">Configure your festival parameters</Text>
      </LinearGradient>

      <ScrollView className="px-5 pb-10">
        {menuItems.map((item, idx) => (
          <Animated.View key={idx} entering={FadeInUp.duration(800).delay(item.delay).springify()}>
            <SsfCard className="mb-4 p-5 flex-row items-center">
              <View className="w-12 h-12 rounded-2xl bg-ssf-bg items-center justify-center mr-4">
                {item.icon}
              </View>
              <View className="flex-1">
                <Text className="text-lg font-poppins-black text-ssf-text">{item.title}</Text>
                <Text className="text-xs text-ssf-text-muted mt-1">{item.desc}</Text>
              </View>
              <SsfButton 
                label="Open" 
                size="sm" 
                variant="outline" 
                onPress={() => router.push(item.route as any)} 
              />
            </SsfCard>
          </Animated.View>
        ))}

        <Animated.View entering={FadeInUp.duration(800).delay(700).springify()} className="mt-6">
          <SsfButton 
            label="Back to Dashboard" 
            variant="ghost" 
            onPress={() => router.back()} 
            className="w-full"
          />
        </Animated.View>
      </ScrollView>
    </View>
  );
}
