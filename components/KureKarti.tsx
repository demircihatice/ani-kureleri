import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { DUYGULAR } from '../constants/duygular';
import { RENKLER } from '../constants/tema';
import type { KureOzeti } from '../types/kure';

export function KureKarti({ kure }: { kure: KureOzeti }) {
  const renk = DUYGULAR.find((duygu) => duygu.tur === kure.emotion_type)?.renk ?? '#BAA6CE';
  return (
    <Pressable style={stiller.kart} accessibilityRole="button" accessibilityLabel={`${kure.name}, ${kure.aniSayisi} Anı`}
      onPress={() => router.push({ pathname: '/kure/[id]', params: { id: kure.id } })}>
      <View style={[stiller.kure, { backgroundColor: renk }]}>
        <View style={stiller.parilti} />
      </View>
      <View style={stiller.metin}>
        <Text style={stiller.ad}>{kure.name}</Text>
        <Text style={stiller.sayi}>{kure.aniSayisi} Anı</Text>
      </View>
    </Pressable>
  );
}

const stiller = StyleSheet.create({
  kart: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 22, flexDirection: 'row', alignItems: 'center', gap: 20 },
  kure: { width: 64, height: 64, borderRadius: 32, padding: 12, borderWidth: 1, borderColor: '#FFFFFF' },
  parilti: { width: 20, height: 12, borderRadius: 10, backgroundColor: '#FFFFFF80', transform: [{ rotate: '-35deg' }] },
  metin: { flex: 1, gap: 6 },
  ad: { color: RENKLER.yazi, fontSize: 22, fontWeight: '600' },
  sayi: { color: RENKLER.ikincil, fontSize: 16 },
});
