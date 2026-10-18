import type { PropsWithChildren, ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RENKLER } from '../constants/tema';

export function Sayfa({ children, alt, ortala = false }: PropsWithChildren<{ alt?: ReactNode; ortala?: boolean }>) {
  return (
    <SafeAreaView edges={alt ? ['top', 'left', 'right'] : ['top', 'bottom', 'left', 'right']} style={stiller.sayfa}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[stiller.icerik, ortala && { justifyContent: 'center' }]}>
          <View style={[stiller.govde, ortala && { justifyContent: 'center' }]}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
      {alt}
    </SafeAreaView>
  );
}

const stiller = StyleSheet.create({
  sayfa: { flex: 1, backgroundColor: RENKLER.zemin },
  icerik: { flexGrow: 1, padding: 20, width: '100%', maxWidth: 720, alignSelf: 'center' },
  govde: { flexGrow: 1, gap: 20 },
});
