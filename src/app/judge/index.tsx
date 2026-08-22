import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ActivityIndicator, Animated, Platform,
  KeyboardAvoidingView, ScrollView, StyleSheet, useWindowDimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ShieldCheck, AlertCircle, ArrowRight, Camera, X } from 'lucide-react-native';
import { judgeTokenService } from '../../services/judgeTokenService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { supabase } from '../../core/config/supabase';

export default function JudgePortalLanding() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  
  // New States for Scanner & Approval
  const [isScanning, setIsScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [waitingForApproval, setWaitingForApproval] = useState(false);
  const [currentTokenId, setCurrentTokenId] = useState<string | null>(null);
  const [tokenDataObj, setTokenDataObj] = useState<any>(null);

  const shakeAnim = useRef(new Animated.Value(0)).current;
  const inputRefs = useRef<(TextInput | null)[]>(Array(6).fill(null));

  // Auto-fill code from URL if present
  useEffect(() => {
    if (params.code && typeof params.code === 'string') {
      const formatted = params.code.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 6);
      setCode(formatted);
      if (formatted.length === 6) {
        // We cannot auto-submit reliably without user interaction in some environments,
        // but since we are showing a UI, we can just pre-fill it.
      }
    }
  }, [params.code]);

  // Realtime subscription for Approval Wait
  useEffect(() => {
    if (!waitingForApproval || !currentTokenId) return;

    const channel = supabase
      .channel(`judge_token_${currentTokenId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'judge_tokens',
          filter: `id=eq.${currentTokenId}`,
        },
        async (payload: any) => {
          const newStatus = payload.new.status;
          if (newStatus === 'approved') {
            await AsyncStorage.setItem('judge_session_token', code);
            await AsyncStorage.setItem('judge_session_data', JSON.stringify(tokenDataObj));
            router.replace('/judge/marks' as any);
          } else if (newStatus === 'rejected') {
            setWaitingForApproval(false);
            setCurrentTokenId(null);
            setError('Your login request was rejected by the administrator.');
            shake();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [waitingForApproval, currentTokenId, code, tokenDataObj]);

  // Secure fallback when Realtime is unavailable or the anon role cannot read
  // table changes directly. The RPC returns only the status for this code.
  useEffect(() => {
    if (!waitingForApproval || !code || !tokenDataObj) return;

    let cancelled = false;
    const checkStatus = async () => {
      try {
        const status = await judgeTokenService.getLoginStatus(code);
        if (cancelled) return;

        if (status === 'approved') {
          await AsyncStorage.setItem('judge_session_token', code);
          await AsyncStorage.setItem('judge_session_data', JSON.stringify(tokenDataObj));
          router.replace('/judge/marks' as any);
        } else if (status === 'rejected' || status === 'expired' || status === 'used' || status === 'invalid') {
          setWaitingForApproval(false);
          setCurrentTokenId(null);
          setError(
            status === 'rejected'
              ? 'Your login request was rejected by the administrator.'
              : 'This access code is no longer valid.'
          );
        }
      } catch (statusError) {
        console.warn('Unable to refresh approval status:', statusError);
      }
    };

    checkStatus();
    const intervalId = setInterval(checkStatus, 2000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [waitingForApproval, code, tokenDataObj, router]);

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

  const handleSubmit = async (codeToSubmit?: string | any) => {
    // If called from onPress, codeToSubmit might be an event object
    const finalCode = typeof codeToSubmit === 'string' ? codeToSubmit : code;
    if (finalCode.length < 6) {
      setError('Please enter a complete 6-character code.');
      shake();
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const tokenData = await judgeTokenService.validateToken(finalCode);
      // Instead of replacing router, we request login and wait for approval
      const request = await judgeTokenService.requestLogin(finalCode);
      if (request?.status === 'approved') {
        await AsyncStorage.setItem('judge_session_token', finalCode);
        await AsyncStorage.setItem('judge_session_data', JSON.stringify(tokenData));
        router.replace('/judge/marks' as any);
        return;
      }
      setTokenDataObj(tokenData);
      setCurrentTokenId(request?.id ?? tokenData.id);
      setWaitingForApproval(true);
    } catch (e: any) {
      setError(e.message ?? 'Invalid code. Please try again.');
      shake();
    } finally {
      setIsLoading(false);
    }
  };

  const handleBarCodeScanned = ({ type, data }: { type: string; data: string }) => {
    if (!isScanning) return;
    setIsScanning(false);
    // Data might be a URL: http://domain.com/judge?code=ABCDEF or just ABCDEF
    let extractedCode = data;
    try {
      if (data.includes('code=')) {
        const url = new URL(data);
        extractedCode = url.searchParams.get('code') || data;
      }
    } catch {
      // Not a URL, use raw data
    }
    const cleanCode = extractedCode.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 6);
    if (cleanCode.length === 6) {
      setCode(cleanCode);
      handleSubmit(cleanCode);
    } else {
      setError('Invalid QR Code format.');
      shake();
    }
  };

  const startScanning = async () => {
    setError('');

    if (Platform.OS === 'web') {
      if (!window.isSecureContext) {
        setError('Camera requires HTTPS or localhost. Open the Judge Portal using localhost or a secure HTTPS link.');
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Camera access is not supported by this browser. Enter the 6-character code manually.');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        stream.getTracks().forEach((track) => track.stop());
        setIsScanning(true);
      } catch (cameraError: any) {
        const blocked = cameraError?.name === 'NotAllowedError' || cameraError?.name === 'PermissionDeniedError';
        setError(
          blocked
            ? 'Camera is blocked. Click the camera/lock icon in the address bar, set Camera to Allow, then press Scan QR Code again.'
            : 'Unable to open the camera. Check whether another app is using it, or enter the code manually.'
        );
      }
      return;
    }

    if (!permission?.granted) {
      const result = await requestPermission();
      if (result.status !== 'granted') {
        setError(
          result.canAskAgain
            ? 'Camera permission is required. Tap Scan QR Code and choose Allow.'
            : 'Camera is blocked in device settings. Enable camera access for this app, then try again.'
        );
        return;
      }
    }
    setIsScanning(true);
  };

  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-white"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 40, backgroundColor: '#F8FAFC' }} keyboardShouldPersistTaps="handled">
        
        <View style={[styles.contentShell, isMobile && styles.contentShellMobile, { backgroundColor: '#FFFFFF', borderColor: '#E2E8F0', borderWidth: 1, borderRadius: 24, padding: 32, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 5 }]}>
          <View style={[styles.landingCard, isMobile && styles.landingCardMobile, { backgroundColor: 'transparent', padding: 0 }]}>
            
            {waitingForApproval ? (
              <View className="items-center py-10">
                <ActivityIndicator size="large" color="#0F172A" />
                <Text className="text-2xl font-poppins-bold text-slate-900 text-center mt-6 mb-2">
                  Waiting for Approval
                </Text>
                <Text className="text-slate-500 font-poppins text-center text-sm leading-5 mb-8">
                  Your request has been sent to the administrator.{'\n'}Please wait while they confirm your login.
                </Text>
                {error ? (
                  <Text className="font-poppins text-red-500 text-sm text-center mb-6">{error}</Text>
                ) : null}
                <TouchableOpacity
                  onPress={() => {
                    setWaitingForApproval(false);
                    setCurrentTokenId(null);
                    setError('');
                  }}
                  className="border border-slate-200 rounded-lg px-6 py-3 bg-white"
                >
                  <Text className="font-poppins-medium text-slate-700 text-sm">Cancel</Text>
                </TouchableOpacity>
              </View>
            ) : isScanning ? (
              <View className="w-full h-96 rounded-2xl overflow-hidden bg-slate-900 relative">
                <CameraView
                  style={{ flex: 1 }}
                  facing="back"
                  onBarcodeScanned={handleBarCodeScanned}
                  barcodeScannerSettings={{
                    barcodeTypes: ['qr'],
                  }}
                />
                <View className="absolute top-0 left-0 right-0 bottom-0 border-2 border-slate-400/50 m-12 rounded-xl" />
                <TouchableOpacity
                  onPress={() => setIsScanning(false)}
                  className="absolute top-4 right-4 bg-black/50 p-2 rounded-full"
                >
                  <X color="#FFF" size={24} />
                </TouchableOpacity>
                <Text className="absolute bottom-6 left-0 right-0 text-center font-poppins-medium text-white text-sm bg-black/50 py-2">
                  Point camera at QR Code
                </Text>
              </View>
            ) : (
              <>
                {/* Header */}
                <View className="items-center mb-8">
                  <View className="w-16 h-16 rounded-2xl bg-slate-100 border border-slate-200 items-center justify-center mb-5">
                    <ShieldCheck size={32} color="#0F172A" strokeWidth={1.5} />
                  </View>
                  <Text className="text-3xl font-poppins-bold text-slate-900 text-center mb-2 tracking-tight">
                    Judging System
                  </Text>
                  <Text className="text-slate-500 font-poppins text-center text-sm leading-5">
                    Enter your one-time access code to continue
                  </Text>
                </View>

                {/* Card content */}
                <View className="items-center w-full">
                  <Text className="font-poppins-medium text-slate-700 text-sm mb-1 self-start">Access Code</Text>
                  <Text className="font-poppins text-slate-400 text-xs mb-4 self-start">
                    You should have received this from the event coordinator
                  </Text>

                  <Animated.View style={{ transform: [{ translateX: shakeAnim }], width: '100%', maxWidth: 400, alignSelf: 'center', marginBottom: 16 }}>
                    <View className="flex-row justify-between w-full gap-x-2">
                      {Array.from({ length: 6 }, (_, i) => {
                        const isActive = activeIndex === i;
                        const isFilled = code[i] !== undefined && code[i] !== ' ';
                        const val = code[i] !== ' ' ? code[i] : '';

                        return (
                          <View
                            key={i}
                            style={{
                              flex: 1,
                              aspectRatio: 1,
                              maxWidth: isMobile ? 48 : 56,
                              backgroundColor: isActive ? '#FFFFFF' : isFilled ? '#F8FAFC' : '#F1F5F9',
                              borderWidth: 1.5,
                              borderColor: isActive ? '#0F172A' : isFilled ? '#CBD5E1' : '#E2E8F0',
                            }}
                            className="rounded-xl items-center justify-center relative overflow-hidden"
                          >
                            <TextInput
                              ref={(ref) => { inputRefs.current[i] = ref; }}
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
                              className="absolute w-full h-full text-center font-poppins-bold text-slate-900"
                              style={[{ zIndex: 10, fontSize: isMobile ? 24 : 28 }, { outlineStyle: 'none' } as any]}
                              cursorColor="#0F172A"
                            />
                          </View>
                        );
                      })}
                    </View>
                  </Animated.View>

                  {error ? (
                    <View className="flex-row items-center gap-x-2 mb-4 px-1 w-full bg-red-50 p-3 rounded-lg border border-red-100">
                      <AlertCircle size={14} color="#EF4444" />
                      <Text className="font-poppins text-red-600 text-xs flex-1">{error}</Text>
                    </View>
                  ) : <View className="mb-4" />}

                  <TouchableOpacity
                    onPress={handleSubmit}
                    disabled={isLoading || code.length < 6}
                    style={{ width: '100%', maxWidth: 400 }}
                  >
                    <View
                      className={`rounded-xl py-3.5 flex-row items-center justify-center gap-x-2 ${
                        code.length === 6 && !isLoading ? 'bg-slate-900' : 'bg-slate-100'
                      }`}
                    >
                      {isLoading ? (
                        <ActivityIndicator color={code.length === 6 ? "#FFF" : "#94A3B8"} />
                      ) : (
                        <>
                          <Text className={`font-poppins-medium text-sm ${
                            code.length === 6 ? 'text-white' : 'text-slate-400'
                          }`}>Enter Portal</Text>
                          <ArrowRight size={16} color={code.length === 6 ? '#FFF' : '#94A3B8'} />
                        </>
                      )}
                    </View>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    onPress={startScanning}
                    style={{ width: '100%', maxWidth: 400, marginTop: 12 }}
                  >
                    <View className="rounded-xl py-3.5 flex-row items-center justify-center gap-x-2 border border-slate-200 bg-white">
                      <Camera size={16} color="#0F172A" />
                      <Text className="font-poppins-medium text-sm text-slate-700">Scan QR Code</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>

        <View className="mt-8 items-center opacity-60">
          <Text className="text-slate-400 font-poppins text-xs tracking-wider uppercase mb-1">
            Powered by SSF
          </Text>
        </View>

      </ScrollView>
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
    borderRadius: 10,
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
