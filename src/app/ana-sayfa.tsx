import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Sayfa } from '../../components/Sayfa';
import { Dugme } from '../../components/Dugme';
import { KureKarti } from '../../components/KureKarti';
import { RENKLER } from '../../constants/tema';
import { useOturum } from '../../hooks/useOturum';
import { useKureler } from '../../hooks/useKureler';

export default function AnaSayfa() {
  const { oturum } = useOturum();
  const { set, yukleniyor, hata, yenile } = useKureler(oturum?.user.id ?? '');
  return (
    <Sayfa>
      <Text style={stiller.marka}>Anı Küreleri</Text>
      <Text accessibilityRole="header" style={stiller.baslik}>Kürelerim</Text>
      <Text style={stiller.aciklama}>Her anına, hissettiğin duyguyla bir yer aç.</Text>
      {yukleniyor ? <View style={stiller.bilgi}>
        <ActivityIndicator size="large" color={RENKLER.yazi} />
        <Text style={stiller.aciklama}>Kürelerin yükleniyor…</Text>
      </View> : hata ? <Text accessibilityRole="alert" style={stiller.hata}>{hata}</Text>
        : !set || set.kureler.length === 0 ? <Text style={stiller.aciklama}>
          Kürelerin henüz hazır değil. E-posta doğrulamanı tamamladıysan tekrar dene.
        </Text> : <>
          <Text style={stiller.setAdi}>{set.name}</Text>
          {set.kureler.map((kure) => <KureKarti key={kure.id} kure={kure} />)}
        </>}
      <Dugme baslik={hata ? 'Tekrar dene' : 'Yenile'} ikincil bekliyor={yukleniyor} tiklaninca={yenile} />
      <Dugme baslik="Yeni Anı Ekle" tiklaninca={() => router.push('/yeni-ani')} />
      <Dugme baslik="Profilim" tiklaninca={() => router.push('/profil')} />
    </Sayfa>
  );
}

const stiller = StyleSheet.create({
  marka: { color: RENKLER.ikincil, fontSize: 15, letterSpacing: 1 },
  baslik: { color: RENKLER.yazi, fontSize: 32, fontWeight: '700' },
  aciklama: { color: RENKLER.ikincil, fontSize: 15, lineHeight: 24 },
  setAdi: { color: RENKLER.ikincil, fontSize: 14, marginTop: 6 },
  bilgi: { alignItems: 'center', gap: 12, paddingVertical: 24 },
  hata: { color: '#9F303B', lineHeight: 22 },
});
