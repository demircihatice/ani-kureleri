import { useRef, useState } from 'react';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Sayfa } from '../../components/Sayfa';
import { Dugme } from '../../components/Dugme';
import { RENKLER } from '../../constants/tema';
import { useOturum } from '../../hooks/useOturum';
import { cikisYap } from '../../services/authService';
import { authHataMesaji } from '../../lib/authDogrulama';

export default function ProfilEkrani() {
  const { oturum } = useOturum();
  const [bekliyor, bekliyorAyarla] = useState(false);
  const [hata, hataAyarla] = useState<string | null>(null);
  const istekSuruyor = useRef(false);
  const ad = oturum?.user.user_metadata.full_name;

  async function cik() {
    if (istekSuruyor.current) return;
    istekSuruyor.current = true;
    bekliyorAyarla(true);
    hataAyarla(null);
    try { await cikisYap(); }
    catch (sorun) { hataAyarla(authHataMesaji(sorun)); }
    finally { istekSuruyor.current = false; bekliyorAyarla(false); }
  }

  return (
    <Sayfa>
      <Text style={stiller.marka}>Anı Küreleri</Text>
      <Text accessibilityRole="header" style={stiller.baslik}>Hoş geldin</Text>
      <View style={stiller.kart}>
        <Text style={stiller.etiket}>Ad soyad</Text>
        <Text style={stiller.deger}>{typeof ad === 'string' && ad.trim() ? ad : 'Ad belirtilmedi'}</Text>
        <Text style={stiller.etiket}>E-posta</Text>
        <Text style={stiller.deger}>{oturum?.user.email}</Text>
      </View>
      <Dugme baslik="Kürelerime dön" ikincil tiklaninca={() => router.replace('/ana-sayfa')} />
      {hata && <Text accessibilityRole="alert" style={stiller.hata}>{hata}</Text>}
      <Dugme baslik="Çıkış yap" bekliyor={bekliyor} tiklaninca={() => void cik()} />
    </Sayfa>
  );
}

const stiller = StyleSheet.create({
  marka: { color: RENKLER.ikincil, fontSize: 15, letterSpacing: 1 },
  baslik: { color: RENKLER.yazi, fontSize: 32, fontWeight: '700' },
  kart: { padding: 24, borderRadius: 24, backgroundColor: '#FFFFFF', gap: 12 },
  etiket: { color: RENKLER.ikincil, fontSize: 13 },
  deger: { color: RENKLER.yazi, fontSize: 18, fontWeight: '500' },
  hata: { color: '#9F303B', lineHeight: 22 },
});
