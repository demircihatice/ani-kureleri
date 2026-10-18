import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { RENKLER } from '../../constants/tema';
const sekmeler = [
  { yol: '/galeri', ad: 'Galeri', ikon: 'grid-outline' },
  { yol: '/yeni-ani', ad: 'Yeni Anı', ikon: 'add' },
  { yol: '/profil', ad: 'Profil', ikon: 'person-outline' },
] as const;
export function AltGezinme({ etkin }: { etkin: (typeof sekmeler)[number]['yol'] }) {
  return <SafeAreaView edges={['bottom']} style={{ backgroundColor: '#FFFFFF' }}>
    <View style={s.alan}>{sekmeler.map((sekme) => <Pressable key={sekme.yol} accessibilityRole="tab"
    accessibilityLabel={sekme.ad} accessibilityState={{ selected: etkin === sekme.yol }}
    style={s.sekme} onPress={() => { if (etkin !== sekme.yol) router.replace(sekme.yol); }}>
    <View style={sekme.yol === '/yeni-ani' ? s.ekle : undefined}>
      <Ionicons name={sekme.ikon} size={26} accessible={false}
        color={sekme.yol === '/yeni-ani' ? '#FFFFFF' : etkin === sekme.yol ? RENKLER.anaKoyu : RENKLER.ikincil} />
    </View>
    <Text style={[s.yazi, etkin === sekme.yol && s.etkin]}>{sekme.ad}</Text>
  </Pressable>)}</View></SafeAreaView>;
}
const s = StyleSheet.create({
  alan: { flexDirection: 'row', borderTopWidth: 1, borderColor: RENKLER.kenar, backgroundColor: '#FFFFFF', paddingHorizontal: 8, paddingVertical: 8 },
  sekme: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 60, gap: 3 },
  yazi: { fontSize: 11, color: RENKLER.ikincil }, etkin: { color: RENKLER.anaKoyu, fontWeight: '700' },
  ekle: { backgroundColor: RENKLER.ana, borderRadius: 24, width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
});
