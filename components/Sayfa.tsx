import type { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RENKLER } from '../constants/tema';

export function Sayfa({ children }: PropsWithChildren) {
  return (
    <SafeAreaView style={stiller.sayfa}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={stiller.icerik}>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const stiller = StyleSheet.create({
  sayfa: { flex: 1, backgroundColor: RENKLER.zemin },
  icerik: { flexGrow: 1, justifyContent: 'center', padding: 28, width: '100%', maxWidth: 540, alignSelf: 'center', gap: 16 },
});
