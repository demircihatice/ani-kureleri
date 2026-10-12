import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Dugme } from '../../../components/Dugme';
import { AniKarti } from '../../../components/AniKarti';
import { useOturum } from '../../../hooks/useOturum';
import { useKureAnilari } from '../../../hooks/useKureAnilari';
import { DUYGULAR } from '../../../constants/duygular';
import { RENKLER } from '../../../constants/tema';

export default function KureDetayi() {
  const params = useLocalSearchParams<{ id: string; kaydedildi?: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const { oturum } = useOturum();
  const { bilgi, yukleniyor, dahaYukleniyor, hata, yenile, dahaFazla } = useKureAnilari(oturum?.user.id ?? '', id);
  const renk = DUYGULAR.find((duygu) => duygu.tur === bilgi?.kure.emotion_type)?.renk ?? '#BAA6CE';
  return <SafeAreaView style={stiller.sayfa}>
    <FlatList data={bilgi?.anilar ?? []} keyExtractor={(ani) => ani.id}
      renderItem={({ item }) => <AniKarti ani={item} />}
      contentContainerStyle={stiller.icerik} ItemSeparatorComponent={() => <View style={{ height: 18 }} />}
      refreshing={yukleniyor} onRefresh={yenile} initialNumToRender={5}
      ListHeaderComponent={<View style={stiller.baslikAlani}>
        <View style={stiller.baslikSatiri}>
          <View style={[stiller.kure, { backgroundColor: renk }]} />
          <Text accessibilityRole="header" style={stiller.baslik}>{bilgi?.kure.name ?? 'Kürenin Anıları'}</Text>
        </View>
        {bilgi && <Text style={stiller.metin}>{bilgi.toplam} Anı · Yeniden eskiye</Text>}
        {params.kaydedildi === '1' && <Text style={stiller.metin}>Anın kaydedildi.</Text>}
        <Dugme baslik={hata && !bilgi ? 'Tekrar dene' : 'Yenile'} ikincil bekliyor={yukleniyor} tiklaninca={yenile} />
        <Dugme baslik="Kürelerime dön" tiklaninca={() => router.replace('/ana-sayfa')} />
        {hata && <Text accessibilityRole="alert" style={stiller.hata}>{hata}</Text>}
        {bilgi?.fotografUyarisi && <Text style={stiller.metin}>Bazı fotoğraflar yüklenemedi. Yenile ile tekrar deneyebilirsin.</Text>}
      </View>}
      ListEmptyComponent={yukleniyor ? <View style={stiller.bosAlan}>
        <ActivityIndicator size="large" color={RENKLER.yazi} />
        <Text style={stiller.metin}>Anıların yükleniyor…</Text>
      </View> : !hata && bilgi ? <View style={stiller.bosAlan}>
        <Text style={stiller.bosBaslik}>Henüz anı yok</Text>
        <Text style={stiller.metin}>Bu küredeki ilk anın için ana sayfadan Yeni Anı Ekle seçebilirsin.</Text>
      </View> : null}
      ListFooterComponent={bilgi?.devamVar ? <View style={stiller.altAlan}>
        <Dugme baslik="Daha fazla anı" ikincil bekliyor={dahaYukleniyor} tiklaninca={dahaFazla} />
      </View> : null} />
  </SafeAreaView>;
}

const stiller = StyleSheet.create({
  sayfa: { flex: 1, backgroundColor: RENKLER.zemin },
  icerik: { flexGrow: 1, padding: 24, width: '100%', maxWidth: 640, alignSelf: 'center' },
  baslikAlani: { gap: 14, marginBottom: 24 },
  baslikSatiri: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  kure: { width: 42, height: 42, borderRadius: 21 },
  baslik: { color: RENKLER.yazi, fontSize: 30, fontWeight: '700', flex: 1 },
  metin: { color: RENKLER.ikincil, lineHeight: 24 },
  hata: { color: '#9F303B', lineHeight: 24 },
  bosAlan: { padding: 24, gap: 14, backgroundColor: '#FFFFFF', borderRadius: 24 },
  bosBaslik: { color: RENKLER.yazi, fontSize: 22, fontWeight: '600' },
  altAlan: { paddingVertical: 24 },
});
