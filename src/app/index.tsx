import { StyleSheet, Text, View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DuyguKuresi } from '../../components/DuyguKuresi';
import { DUYGULAR } from '../../constants/duygular';
import { RENKLER } from '../../constants/tema';
import { router } from 'expo-router';
import { Dugme } from '../../components/Dugme';

export default function BaslangicEkrani() {
  return (
    <SafeAreaView style={stiller.sayfa}>
      <ScrollView contentContainerStyle={stiller.icerik}>
        <Text style={stiller.etiket}>HER ANI, BİR DUYGU</Text>
        <Text accessibilityRole="header" style={stiller.baslik}>Anı Küreleri</Text>
        <Text style={stiller.aciklama}>Bir fotoğraf, bir his, sana ait bir hikâye.</Text>
        <View style={stiller.kureler}>
          {DUYGULAR.map((duygu) => <DuyguKuresi key={duygu.tur} duygu={duygu} />)}
        </View>
        <View style={stiller.kart}>
          <Text style={stiller.kartBasligi}>Anılarına bir yer aç.</Text>
          <Text style={stiller.metin}>
            Mutlu anların, özlediklerin ve geçmişten kalan güzel izler burada bir araya gelecek.
          </Text>
        </View>
        <Dugme baslik="Giriş yap" tiklaninca={() => router.push('/giris')} />
        <Dugme baslik="Kayıt ol" ikincil tiklaninca={() => router.push('/kayit')} />
      </ScrollView>
    </SafeAreaView>
  );
}

const stiller = StyleSheet.create({
  sayfa: { flex: 1, backgroundColor: RENKLER.zemin },
  icerik: { flexGrow: 1, justifyContent: 'center', padding: 28, width: '100%', maxWidth: 540, alignSelf: 'center', gap: 16 },
  etiket: { textAlign: 'center', fontSize: 11, letterSpacing: 3, color: RENKLER.ikincil },
  baslik: { fontSize: 38, fontWeight: '700', color: RENKLER.yazi, textAlign: 'center' },
  aciklama: { fontSize: 16, lineHeight: 25, color: RENKLER.ikincil, textAlign: 'center' },
  kureler: { flexDirection: 'row', justifyContent: 'space-evenly', flexWrap: 'wrap', gap: 14, paddingVertical: 28 },
  kart: { padding: 24, backgroundColor: '#FFFFFF', borderRadius: 24, gap: 10 },
  kartBasligi: { fontSize: 20, fontWeight: '600', color: RENKLER.yazi },
  metin: { fontSize: 15, lineHeight: 24, color: RENKLER.ikincil },
});
