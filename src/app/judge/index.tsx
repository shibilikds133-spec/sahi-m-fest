import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ActivityIndicator, Animated, Platform,
  KeyboardAvoidingView, ScrollView, StyleSheet, useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ShieldCheck, AlertCircle, ArrowRight } from 'lucide-react-native';
import { judgeTokenService } from '../../services/judgeTokenService';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function JudgePortalLanding() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const inputRefs = useRef<(TextInput | null)[]>(Array(6).fill(null));

  const handleBoxChange = (text: string, index: number) => {
    setError('');
    
    const oldChar = code[index] !== ' ' && code[index] !== undefined ? code[index] : '';
    const isPaste = text.length > 1 && !(text.length === 2 && text.startsWith(oldChar));

    if (isPaste) {
      const pasted = text.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 6);
      setCode(pasted);
      const nextIndex = Math.min(pasted.length, 5);
      setActiveIndex(nextIndex);
      inputRefs.current[nextIndex]?.focus();
      return;
    }

    let newChar = text.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    if (newChar.length > 1) newChar = newChar.slice(-1);

    const codeArr = code.padEnd(6, ' ').split('');
    codeArr[index] = newChar || ' ';
    const newCode = codeArr.join('').trimEnd();
    setCode(newCode);

    if (newChar && index < 5) {
      setActiveIndex(index + 1);
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace') {
      const codeArr = code.padEnd(6, ' ').split('');
      if (codeArr[index] === ' ' && index > 0) {
        codeArr[index - 1] = ' ';
        setCode(codeArr.join('').trimEnd());
        setActiveIndex(index - 1);
        inputRefs.current[index - 1]?.focus();
      }
    }
  };

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const handleSubmit = async () => {
    if (code.length < 6) {
      setError('Please enter a complete 6-character code.');
      shake();
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const tokenData = await judgeTokenService.validateToken(code);
      await AsyncStorage.setItem('judge_session_token', code);
      await AsyncStorage.setItem('judge_session_data', JSON.stringify(tokenData));
      router.replace('/judge/marks' as any);
    } catch (e: any) {
      setError(e.message ?? 'Invalid code. Please try again.');
      shake();
    } finally {
      setIsLoading(false);
    }
  };

  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  return (
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <LinearGradient
        colors={['#030F26', '#021E1B', '#02241F']}
        start={{ x: 0.1, y: 0.1 }}
        end={{ x: 0.9, y: 0.9 }}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 40 }} keyboardShouldPersistTaps="handled">
          
          <View style={[styles.contentShell, isMobile && styles.contentShellMobile]}>
            <View style={[styles.landingCard, isMobile && styles.landingCardMobile]}>
              {/* Header */}
              <View className="items-center mb-10">
              <View className="w-24 h-24 rounded-3xl bg-white/10 border border-white/20 items-center justify-center mb-6">
                <ShieldCheck size={48} color="#FFF" strokeWidth={1.5} />
              </View>
              <Text className="text-4xl font-poppins-black text-white text-center mb-2">
                Judge Portal
              </Text>
              <Text className="text-white/60 font-poppins text-center text-sm leading-5">
                Sahithyolsav Judging System{'\n'}Enter your one-time access code to continue
              </Text>
            </View>

              {/* Card content */}
              <View className="items-center">
                <Text className="font-poppins-bold text-white text-base mb-1">Access Code</Text>
                <Text className="font-poppins text-white/50 text-xs mb-6 text-center">
                  You should have received this from the event coordinator
                </Text>

                <Animated.View style={{ transform: [{ translateX: shakeAnim }], width: '100%', maxWidth: 400, alignSelf: 'center', marginBottom: 16 }}>
                  <View className="flex-row justify-between w-full">
                    {Array.from({ length: 6 }, (_, i) => {
                      const isActive = activeIndex === i;
                      const isFilled = code[i] !== undefined && code[i] !== ' ';
                      const val = code[i] !== ' ' ? code[i] : '';

                      return (
                        <View
                          key={i}
                          style={{
                            width: isMobile ? 48 : 56,
                            height: isMobile ? 56 : 64,
                            transform: [{ scale: isActive ? 1.05 : 1 }],
                            shadowColor: isActive ? '#60A5FA' : '#000',
                            shadowOffset: { width: 0, height: isActive ? 0 : 4 },
                            shadowOpacity: isActive ? 0.8 : 0.4,
                            shadowRadius: isActive ? 12 : 6,
                            elevation: isActive ? 8 : 4,
                            backgroundColor: isActive ? 'rgba(59, 130, 246, 0.15)' : isFilled ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.04)',
                            borderWidth: 1,
                            borderColor: isActive ? '#60A5FA' : isFilled ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.1)',
                          }}
                          className="rounded-2xl items-center justify-center relative overflow-hidden"
                        >
                          {/* Inner Glass Highlights */}
                          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '40%', backgroundColor: 'rgba(255,255,255,0.05)' }} />
                          
                          <TextInput
                            ref={(ref) => inputRefs.current[i] = ref}
                            value={val || ''}
                            onChangeText={(text) => handleBoxChange(text, i)}
                            onKeyPress={(e) => handleKeyPress(e, i)}
                            onFocus={() => setActiveIndex(i)}
                            onSubmitEditing={() => {
                              if (i === 5) handleSubmit();
                              else inputRefs.current[i + 1]?.focus();
                            }}
                            maxLength={6}
                            autoCapitalize="characters"
                            autoCorrect={false}
                            className="absolute w-full h-full text-center font-poppins-black text-white"
                            style={{ 
                              zIndex: 10, 
                              fontSize: isMobile ? 24 : 28,
                              // @ts-ignore
                              outlineStyle: 'none' 
                            }}
                            cursorColor="#60A5FA"
                          />
                        </View>
                      );
                    })}
                  </View>
                </Animated.View>

                {error ? (
                  <View className="flex-row items-center gap-x-2 mb-5 px-1">
                    <AlertCircle size={14} color="#EF4444" />
                    <Text className="font-poppins text-red-500 text-xs flex-1">{error}</Text>
                  </View>
                ) : <View className="mb-5" />}

                <TouchableOpacity
                  onPress={handleSubmit}
                  disabled={isLoading || code.length < 6}
                  style={{ width: '100%', maxWidth: 400 }}
                >
                  <LinearGradient
                    colors={code.length === 6 && !isLoading ? ['#10B981', '#059669'] : ['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.05)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                className="rounded-2xl py-4 flex-row items-center justify-center gap-x-2 border-t border-white/20"
                style={{
                  shadowColor: '#06B6D4',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: code.length === 6 && !isLoading ? 0.3 : 0,
                  shadowRadius: 10,
                  elevation: 8,
                }}
              >
                {isLoading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <>
                    <Text className={`font-poppins-black text-base ${
                      code.length === 6 ? 'text-white' : 'text-white/40'
                    }`}>Enter Portal</Text>
                    <ArrowRight size={18} color={code.length === 6 ? '#FFF' : 'rgba(255,255,255,0.4)'} />
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <Text className="font-poppins text-white/40 text-xs text-center mt-6 leading-4">
              This code is for single use only.{'\n'}Contact the admin if you need a new code.
            </Text>
          </View>
        </View>

        <Text className="text-white/30 font-poppins text-center text-xs mt-8">
          Sahithyolsav · Powered by SSF
        </Text>
        </View>
        </ScrollView>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  contentShell: {
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    paddingHorizontal: 20,
  },
  contentShellMobile: {
    paddingHorizontal: 12,
  },
  landingCard: {
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 24,
    backgroundColor: 'rgba(3, 15, 38, 0.45)',
    padding: 40,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 40,
    shadowOpacity: 0.5,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(24px)',
      },
      default: {},
    }),
  },
  landingCardMobile: {
    padding: 24,
    borderRadius: 20,
  },
});
