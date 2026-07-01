import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Share,
} from 'react-native';
import { useBudgetStore } from '../store/useBudgetStore';
import { Colors } from '../constants/theme';

export default function OnboardingScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const {
    login,
    isLoading,
    partnerCode,
    generatePartnerCode,
    linkPartner,
    fetchData,
  } = useBudgetStore();

  const [step, setStep] = useState<'welcome' | 'name' | 'connect' | 'code' | 'linked'>('welcome');
  const [displayName, setDisplayName] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  const handleStart = () => setStep('name');

  const handleNameSubmit = async () => {
    setNameError(null);
    const name = displayName.trim();
    if (!name || name.length < 2) {
      setNameError('Please enter your name (at least 2 characters).');
      return;
    }
    try {
      const email = `${name.toLowerCase().replace(/\s+/g, '')}@partner.app`;
      await login(email);
      setStep('connect');
    } catch (err: any) {
      setNameError(err.message || 'Failed to set up account');
    }
  };

  const handleGenerateCode = async () => {
    setLinkError(null);
    await generatePartnerCode();
    // Read fresh state after the store updates
    const currentCode = useBudgetStore.getState().partnerCode;
    if (currentCode) {
      setStep('code');
    }
  };

  const handleShareCode = async () => {
    if (!partnerCode) return;
    try {
      await Share.share({
        message: `💕 Let's connect our budgets! Use this code in the app: ${partnerCode}\n\nDownload the app and enter this code to link our finances together!`,
      });
    } catch (err: any) {
      console.log('Share error:', err.message);
    }
  };

  const handleEnterCode = () => {
    setStep('code');
    setInputCode('');
  };

  const handleLinkPartner = async () => {
    setLinkError(null);
    if (inputCode.trim().length !== 6) {
      setLinkError('Please enter a valid 6-digit code.');
      return;
    }
    try {
      await linkPartner(inputCode.trim());
      setStep('linked');
    } catch (err: any) {
      setLinkError(err.message || 'Failed to link. Check the code and try again.');
    }
  };

  const handleFinish = async () => {
    await fetchData();
  };

  // WELCOME SCREEN
  if (step === 'welcome') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ScrollView contentContainerStyle={styles.centerContent}>
          <View style={styles.welcomeInner}>
            <View style={styles.logoContainer}>
              <View style={[styles.logoCircle, { backgroundColor: colors.primaryLight }]}>
                <Text style={styles.logoText}>❤️</Text>
              </View>
            </View>
            <Text style={[styles.welcomeTitle, { color: colors.primary }]}>Our Finances</Text>
            <Text style={[styles.welcomeSubtitle, { color: colors.onSurfaceVariant }]}>A shared sanctuary for your money together</Text>
            <Text style={[styles.welcomeDescription, { color: colors.onSurfaceVariant }]}>Track expenses together, save for shared goals, and stay in harmony with your partner.</Text>
            <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={handleStart}>
              <Text style={styles.primaryBtnText}>Get Started</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // NAME SCREEN
  if (step === 'name') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex1}>
          <ScrollView contentContainerStyle={styles.centerContent}>
            <View style={styles.formInner}>
              <Text style={[styles.formTitle, { color: colors.onSurface }]}>What's your name?</Text>
              <Text style={[styles.formSubtitle, { color: colors.onSurfaceVariant }]}>This is how your partner will see you.</Text>
              {nameError && <Text style={styles.errorText}>{nameError}</Text>}
              <TextInput
                style={[styles.nameInput, { color: colors.onSurface, borderColor: colors.outlineVariant, backgroundColor: colors.surfaceContainerLow }]}
                placeholder="Enter your name"
                placeholderTextColor={colors.onSurfaceVariant}
                autoCapitalize="words" autoFocus
                value={displayName}
                onChangeText={(t) => { setDisplayName(t); setNameError(null); }}
              />
              <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={handleNameSubmit} disabled={isLoading}>
                <Text style={styles.primaryBtnText}>{isLoading ? 'Setting up...' : 'Continue'}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // CONNECT SCREEN
  if (step === 'connect') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ScrollView contentContainerStyle={styles.centerContent}>
          <View style={styles.formInner}>
            <Text style={[styles.formTitle, { color: colors.onSurface }]}>Connect with Partner</Text>
            <Text style={[styles.formSubtitle, { color: colors.onSurfaceVariant }]}>Would you like to start a new shared budget or join one?</Text>
            <TouchableOpacity style={[styles.optionCard, { backgroundColor: colors.card }]} onPress={handleGenerateCode} disabled={isLoading}>
              <Text style={styles.optionEmoji}>✨</Text>
              <View style={styles.optionTextContainer}>
                <Text style={[styles.optionTitle, { color: colors.onSurface }]}>Create New</Text>
                <Text style={[styles.optionDesc, { color: colors.onSurfaceVariant }]}>Generate a code to share with your partner</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.optionCard, { backgroundColor: colors.card }]} onPress={handleEnterCode}>
              <Text style={styles.optionEmoji}>🔗</Text>
              <View style={styles.optionTextContainer}>
                <Text style={[styles.optionTitle, { color: colors.onSurface }]}>Join Existing</Text>
                <Text style={[styles.optionDesc, { color: colors.onSurfaceVariant }]}>Enter your partner's code to connect</Text>
              </View>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // CODE SCREEN
  if (step === 'code') {
    const isGenerating = !!partnerCode;
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex1}>
          <ScrollView contentContainerStyle={styles.centerContent}>
            {isGenerating ? (
              <View style={styles.formInner}>
                <Text style={[styles.formTitle, { color: colors.onSurface }]}>Your Connection Code</Text>
                <Text style={[styles.formSubtitle, { color: colors.onSurfaceVariant }]}>Share this code with your partner so they can connect to your budget.</Text>
                <View style={[styles.codeDisplay, { backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant }]}>
                  <Text style={[styles.codeText, { color: colors.primary }]}>{partnerCode}</Text>
                </View>
                <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={handleShareCode}>
                  <Text style={styles.primaryBtnText}>Share Code</Text>
                </TouchableOpacity>
                <Text style={[styles.waitingText, { color: colors.onSurfaceVariant }]}>Waiting for your partner to enter this code...</Text>
                <TouchableOpacity style={[styles.secondaryBtn, { borderColor: colors.outlineVariant }]} onPress={handleFinish}>
                  <Text style={[styles.secondaryBtnText, { color: colors.primary }]}>Continue Solo (Link Later)</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.formInner}>
                <Text style={[styles.formTitle, { color: colors.onSurface }]}>Enter Code</Text>
                <Text style={[styles.formSubtitle, { color: colors.onSurfaceVariant }]}>Enter the 6-digit code from your partner to connect your budgets.</Text>
                {linkError && <Text style={styles.errorText}>{linkError}</Text>}
                <TextInput
                  style={[styles.codeInput, { color: colors.onSurface, borderColor: colors.outlineVariant, backgroundColor: colors.surfaceContainerLow }]}
                  placeholder="000000" placeholderTextColor={colors.onSurfaceVariant}
                  keyboardType="number-pad" maxLength={6}
                  value={inputCode} onChangeText={(t) => { setInputCode(t); setLinkError(null); }} autoFocus
                />
                <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={handleLinkPartner} disabled={isLoading}>
                  <Text style={styles.primaryBtnText}>{isLoading ? 'Connecting...' : 'Connect'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.backBtn, { borderColor: colors.outlineVariant }]} onPress={() => setStep('connect')}>
                  <Text style={[styles.backBtnText, { color: colors.onSurfaceVariant }]}>Go Back</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // LINKED SUCCESS SCREEN
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.centerContent}>
        <View style={styles.formInner}>
          <View style={styles.logoContainer}>
            <View style={[styles.logoCircle, { backgroundColor: colors.primaryLight }]}>
              <Text style={styles.logoText}>💕</Text>
            </View>
          </View>
          <Text style={[styles.formTitle, { color: colors.onSurface }]}>You're Connected!</Text>
          <Text style={[styles.formSubtitle, { color: colors.onSurfaceVariant }]}>Your budgets are now linked. You can track expenses together in real-time.</Text>
          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={handleFinish}>
            <Text style={styles.primaryBtnText}>Start Budgeting Together</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex1: { flex: 1 },
  centerContent: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  welcomeInner: { alignItems: 'center', gap: 16 },
  formInner: { gap: 16, maxWidth: 400, width: '100%', alignSelf: 'center' },
  logoContainer: { alignItems: 'center', marginBottom: 16 },
  logoCircle: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', shadowColor: '#D1D9E6', shadowOffset: { width: 4, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  logoText: { fontSize: 36 },
  welcomeTitle: { fontSize: 32, fontWeight: '700', fontFamily: 'Montserrat', textAlign: 'center' },
  welcomeSubtitle: { fontSize: 16, fontWeight: '500', textAlign: 'center', lineHeight: 24 },
  welcomeDescription: { fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  formTitle: { fontSize: 24, fontWeight: '700', fontFamily: 'Montserrat', textAlign: 'center' },
  formSubtitle: { fontSize: 15, fontWeight: '400', textAlign: 'center', lineHeight: 22, marginBottom: 8 },
  errorText: { color: '#BA1A1A', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  nameInput: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 20, paddingVertical: 16, fontSize: 18, textAlign: 'center', fontWeight: '600', marginBottom: 8 },
  codeInput: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 20, paddingVertical: 20, fontSize: 32, textAlign: 'center', fontWeight: '700', letterSpacing: 8, marginBottom: 8 },
  primaryBtn: { width: '100%', paddingVertical: 18, borderRadius: 16, alignItems: 'center', justifyContent: 'center', shadowColor: '#9F402D', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  secondaryBtn: { width: '100%', paddingVertical: 16, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  secondaryBtnText: { fontSize: 15, fontWeight: '600' },
  backBtn: { width: '100%', paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  backBtnText: { fontSize: 14, fontWeight: '500' },
  optionCard: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 20, borderRadius: 20, shadowColor: '#D1D9E6', shadowOffset: { width: 4, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  optionEmoji: { fontSize: 28 },
  optionTextContainer: { flex: 1 },
  optionTitle: { fontSize: 16, fontWeight: '700' },
  optionDesc: { fontSize: 13, marginTop: 2, lineHeight: 18 },
  codeDisplay: { padding: 24, borderRadius: 16, borderWidth: 1, alignItems: 'center', marginVertical: 16 },
  codeText: { fontSize: 40, fontWeight: '700', letterSpacing: 6 },
  waitingText: { fontSize: 14, textAlign: 'center', fontStyle: 'italic', marginTop: 8 },
});
