import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Sayfa } from '../../../components/Sayfa';
import { Dugme } from '../../../components/Dugme';
import { AniGalerisi } from '../../../components/AniGalerisi';
import { AniDuzenlemeFormu } from '../../../components/AniDuzenlemeFormu';
import { useOturum } from '../../../hooks/useOturum';
import { aniDetayiniGetir } from '../../../services/memoryService';
import { kureSetiniGetir } from '../../../services/sphereService';
import { RENKLER } from '../../../constants/tema';
import type { AniDetayi } from '../../../types/ani';
import type { KureOzeti } from '../../../types/kure';

export default function AniRotasi() {
  const params = useLocalSearchParams<{ id: string }>();
  const { oturum } = useOturum();
  const id = typeof params.id === 'string' ? params.id : '';
  const kullaniciId = oturum?.user.id ?? '';
  return <AniEkrani key={`${kullaniciId}-${id}`} kullaniciId={kullaniciId} id={id} />;
}

function AniEkrani({ kullaniciId, id }: { kullaniciId: string; id: string }) {
  const [bilgi, ayarla] = useState<{ ani: AniDetayi; kureler: KureOzeti[] } | null>(null);
  const [hata, hatayiAyarla] = useState<string | null>(null);
  const [yukleniyor, yuklemeyiAyarla] = useState(true);
  const [duzenliyor, duzenlemeyiAyarla] = useState(false);
  const [kaydedildi, kaydiAyarla] = useState(false);
  const istek = useRef<AbortController | null>(null);
  const yukle = useCallback(() => {
    istek.current?.abort();
    const kontrol = new AbortController(); istek.current = kontrol;
    yuklemeyiAyarla(true); hatayiAyarla(null); ayarla(null); duzenlemeyiAyarla(false); kaydiAyarla(false);
    void Promise.all([aniDetayiniGetir(kullaniciId, id, kontrol.signal), kureSetiniGetir(kullaniciId, kontrol.signal)])
      .then(([ani, set]) => {
        if (!set?.kureler.some((k) => k.id === ani.sphere_id)) throw new Error('Anının küresi bulunamadı veya hesabına ait değil.');
        if (!kontrol.signal.aborted) ayarla({ ani, kureler: set.kureler });
      }).catch((sorun: unknown) => {
        if (!kontrol.signal.aborted) hatayiAyarla(sorun instanceof Error ? sorun.message : 'Anı yüklenemedi. Tekrar dene.');
      }).finally(() => { if (!kontrol.signal.aborted) yuklemeyiAyarla(false); });
  }, [kullaniciId, id]);
  useFocusEffect(useCallback(() => { yukle(); return () => istek.current?.abort(); }, [yukle]));
  const kure = bilgi?.kureler.find((k) => k.id === bilgi.ani.sphere_id);
  return <Sayfa>
    <Text accessibilityRole="header" style={stiller.baslik}>Anı Detayı</Text>
    {yukleniyor ? <ActivityIndicator size="large" color={RENKLER.yazi} /> : hata ? <>
      <Text accessibilityRole="alert" style={stiller.hata}>{hata}</Text><Dugme baslik="Tekrar dene" tiklaninca={yukle} />
    </> : bilgi && <>
      <AniGalerisi fotograflar={bilgi.ani.fotograflar} />
      {duzenliyor ? <AniDuzenlemeFormu ani={bilgi.ani} kullaniciId={kullaniciId} kureler={bilgi.kureler}
        vazgec={() => duzenlemeyiAyarla(false)} tamamlandi={(ani) => {
          ayarla({ ...bilgi, ani: { ...bilgi.ani, ...ani } }); duzenlemeyiAyarla(false); kaydiAyarla(true);
        }} /> : <>
        <Text style={stiller.baslik}>{bilgi.ani.title}</Text>
        <Text style={stiller.metin}>{bilgi.ani.description || 'Açıklama eklenmemiş.'}</Text>
        <Text style={stiller.metin}>{new Date(`${bilgi.ani.memory_date}T12:00:00`).toLocaleDateString('tr-TR')}</Text>
        <Text style={stiller.metin}>Duygu küresi: {kure?.name}</Text>
        {kaydedildi && <Text accessibilityLiveRegion="polite" style={stiller.metin}>Değişikliklerin kaydedildi.</Text>}
        <Dugme baslik="Anıyı düzenle" tiklaninca={() => { duzenlemeyiAyarla(true); kaydiAyarla(false); }} />
        <Dugme baslik="Fotoğrafları ve bilgileri yenile" ikincil tiklaninca={yukle} />
        <Dugme baslik="Bağlı küreye git" ikincil tiklaninca={() => router.replace({ pathname: '/kure/[id]', params: { id: bilgi.ani.sphere_id } })} />
      </>}
    </>}
    {!duzenliyor && <Dugme baslik="Kürelerime dön" ikincil tiklaninca={() => router.replace('/ana-sayfa')} />}
  </Sayfa>;
}
const stiller = StyleSheet.create({
  baslik: { color: RENKLER.yazi, fontSize: 28, fontWeight: '700' },
  metin: { color: RENKLER.ikincil, fontSize: 16, lineHeight: 25 },
  hata: { color: '#9F303B', lineHeight: 24 },
});
