import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Pressable,
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
    signUp,
    isLoading,
    partnerCode,
    generatePartnerCode,
    linkPartner,
    fetchData,
  } = useBudgetStore();

  const [step, setStep] = useState<'welcome' | 'auth' | 'connect' | 'code' | 'linked'>('welcome');
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [inputCode, setInputCode] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);
  const codeRef = useRef<TextInput>(null);

  const handleStart = () => {
    setStep('auth');
    setAuthMode('signin');
  };

  // ── Auth step ──

  const validateAuth = (): boolean => {
    setAuthError(null);
    if (!email.trim()) {
      setAuthError('Please enter your email address.');
      return false;
    }
    if (!password) {
      setAuthError('Please enter a password.');
      return false;
    }
    if (authMode === 'signup' && password.length < 6) {
      setAuthError('Password must be at least 6 characters.');
      return false;
    }
    if (authMode === 'signup' && password !== confirmPassword) {
      setAuthError('Passwords do not match.');
      return false;
    }
    return true;
  };

  const handleSignIn = async () => {
    if (!validateAuth()) return;
    try {
      await login(email.trim(), password);
      setStep('connect');
    } catch (err: any) {
      setAuthError(err.message || 'Sign in failed. Check your credentials.');
    }
  };

  const handleSignUp = async () => {
    if (!validateAuth()) return;
    try {
      await signUp(email.trim(), password);
      setStep('connect');
    } catch (err: any) {
      setAuthError(err.message || 'Sign up failed.');
    }
  };

  // ── Connect step ──

  const handleGenerateCode = async () => {
    setLinkError(null);
    await generatePartnerCode();
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

  // ── WELCOME SCREEN ──

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

  // ── AUTH SCREEN (email + password) ──

  if (step === 'auth') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex1}
          enabled={Platform.OS === 'ios'}
        >
          <ScrollView
            contentContainerStyle={styles.centerContent}
            keyboardShouldPersistTaps="always"
          >
            <View style={styles.formInner}>
              <Text style={[styles.formTitle, { color: colors.onSurface }]}>
                {authMode === 'signin' ? 'Welcome Back' : 'Create Account'}
              </Text>
              <Text style={[styles.formSubtitle, { color: colors.onSurfaceVariant }]}>
                {authMode === 'signin'
                  ? 'Sign in to access your shared budget.'
                  : 'Create an account to start budgeting with your partner.'}
              </Text>

              {authError && <Text style={styles.errorText}>{authError}</Text>}

              <View style={styles.fieldGroup}>
                <Pressable onPress={() => emailRef.current?.focus()} style={styles.labelRow}>
                  <Text style={[styles.fieldLabel, { color: colors.onSurfaceVariant }]}>Email</Text>
                </Pressable>
                <TextInput
                  ref={emailRef}
                  nativeID="email"
                  style={[styles.authInput, { color: colors.onSurface, borderColor: colors.outlineVariant, backgroundColor: colors.surfaceContainerLow }]}
                  placeholder="you@example.com"
                  placeholderTextColor={colors.onSurfaceVariant}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={(t) => { setEmail(t); setAuthError(null); }}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Pressable onPress={() => passwordRef.current?.focus()} style={styles.labelRow}>
                  <Text style={[styles.fieldLabel, { color: colors.onSurfaceVariant }]}>Password</Text>
                </Pressable>
                <TextInput
                  ref={passwordRef}
                  nativeID="password"
                  style={[styles.authInput, { color: colors.onSurface, borderColor: colors.outlineVariant, backgroundColor: colors.surfaceContainerLow }]}
                  placeholder="Enter your password"
                  placeholderTextColor={colors.onSurfaceVariant}
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete={authMode === 'signup' ? 'new-password' : 'password'}
                  value={password}
                  onChangeText={(t) => { setPassword(t); setAuthError(null); }}
                />
              </View>

              {authMode === 'signup' && (
                <View style={styles.fieldGroup}>
                  <Pressable onPress={() => confirmPasswordRef.current?.focus()} style={styles.labelRow}>
                    <Text style={[styles.fieldLabel, { color: colors.onSurfaceVariant }]}>Confirm Password</Text>
                  </Pressable>
                  <TextInput
                    ref={confirmPasswordRef}
                    nativeID="confirmPassword"
                    style={[styles.authInput, { color: colors.onSurface, borderColor: colors.outlineVariant, backgroundColor: colors.surfaceContainerLow }]}
                    placeholder="Re-enter your password"
                    placeholderTextColor={colors.onSurfaceVariant}
                    secureTextEntry
                    autoCapitalize="none"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChangeText={(t) => { setConfirmPassword(t); setAuthError(null); }}
                  />
                </View>
              )}

              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                onPress={authMode === 'signin' ? handleSignIn : handleSignUp}
                disabled={isLoading}
              >
                <Text style={styles.primaryBtnText}>
                  {isLoading
                    ? 'Please wait...'
                    : authMode === 'signin'
                      ? 'Sign In'
                      : 'Create Account'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.switchBtn, { borderColor: colors.outlineVariant }]}
                onPress={() => {
                  setAuthMode(authMode === 'signin' ? 'signup' : 'signin');
                  setAuthError(null);
                }}
              >
                <Text style={[styles.switchBtnText, { color: colors.onSurfaceVariant }]}>
                  {authMode === 'signin'
                    ? "Don't have an account? Sign Up"
                    : 'Already have an account? Sign In'}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── CONNECT SCREEN ──

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

  // ── CODE SCREEN ──

  if (step === 'code') {
    const isGenerating = !!partnerCode;
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex1}>
          <ScrollView contentContainerStyle={styles.centerContent} keyboardShouldPersistTaps="handled">
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
                  ref={codeRef}
                  nativeID="partnerCode"
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

  // ── LINKED SUCCESS SCREEN ──

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
  authInput: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 20, paddingVertical: 16, fontSize: 16, fontWeight: '500' },
  fieldGroup: { gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '600', letterSpacing: 0.03, marginLeft: 4 },
  labelRow: { alignSelf: 'flex-start', paddingVertical: 2, paddingHorizontal: 4, cursor: 'pointer' },
  codeInput: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 20, paddingVertical: 20, fontSize: 32, textAlign: 'center', fontWeight: '700', letterSpacing: 8, marginBottom: 8 },
  primaryBtn: { width: '100%', paddingVertical: 18, borderRadius: 16, alignItems: 'center', justifyContent: 'center', shadowColor: '#9F402D', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  secondaryBtn: { width: '100%', paddingVertical: 16, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  secondaryBtnText: { fontSize: 15, fontWeight: '600' },
  backBtn: { width: '100%', paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  backBtnText: { fontSize: 14, fontWeight: '500' },
  switchBtn: { width: '100%', paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, marginTop: -4 },
  switchBtnText: { fontSize: 14, fontWeight: '500' },
  optionCard: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 20, borderRadius: 20, shadowColor: '#D1D9E6', shadowOffset: { width: 4, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  optionEmoji: { fontSize: 28 },
  optionTextContainer: { flex: 1 },
  optionTitle: { fontSize: 16, fontWeight: '700' },
  optionDesc: { fontSize: 13, marginTop: 2, lineHeight: 18 },
  codeDisplay: { padding: 24, borderRadius: 16, borderWidth: 1, alignItems: 'center', marginVertical: 16 },
  codeText: { fontSize: 40, fontWeight: '700', letterSpacing: 6 },
  waitingText: { fontSize: 14, textAlign: 'center', fontStyle: 'italic', marginTop: 8 },
});
