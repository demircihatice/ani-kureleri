import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Sayfa } from '../../../components/Sayfa';
import { Dugme } from '../../../components/Dugme';
import { AniGalerisi } from '../../../components/AniGalerisi';
import { AniDuzenlemeFormu } from '../../../components/AniDuzenlemeFormu';
import { DuyguEtiketi } from '../../../components/ui/DuyguSecimi';
import { useOturum } from '../../../hooks/useOturum';
import { galeriDetayiniGetir } from '../../../services/galleryDetailService';
import { ORTAK, RENKLER } from '../../../constants/tema';
import { duzenlemeDonusunuBildir } from '../../../lib/aniDuzenlemeDonusu';
export default function AniRotasi() {
  const params = useLocalSearchParams<{ id: string; foto?: string; duzenle?: string; donus?: string }>();
  const { oturum } = useOturum();
  const id = typeof params.id === 'string' ? params.id : '';
  const kullaniciId = oturum?.user.id ?? '';
  const ilkFoto = typeof params.foto === 'string' && /^[0-4]$/.test(params.foto) ? Number(params.foto) : 0;
  return <AniEkrani key={`${kullaniciId}-${id}-${ilkFoto}-${params.duzenle}-${params.donus}`} kullaniciId={kullaniciId} id={id} ilkFoto={ilkFoto} ilkDuzenle={params.duzenle === '1'} donus={typeof params.donus === 'string' ? params.donus : undefined} />;
}
export function AniEkrani({ kullaniciId, id, ilkFoto = 0, ilkDuzenle = false, donus }: { kullaniciId: string; id: string; ilkFoto?: number; ilkDuzenle?: boolean; donus?: string }) {
  const [donusSonucu, donusuAyarla] = useState<boolean | null>(null);
  useEffect(() => {
    if (!donus || donusSonucu === null) return;
    duzenlemeDonusunuBildir(donus, kullaniciId, id, donusSonucu);
    if (router.canGoBack()) router.back(); else router.replace('/galeri');
  }, [donus, donusSonucu, kullaniciId, id]);
  const [bilgi, ayarla] = useState<Awaited<ReturnType<typeof galeriDetayiniGetir>> | null>(null);
  const [hata, hatayiAyarla] = useState<string | null>(null);
  const [yukleniyor, yuklemeyiAyarla] = useState(true);
  const [duzenliyor, duzenlemeyiAyarla] = useState(ilkDuzenle);
  const [kaydedildi, kaydiAyarla] = useState(false);
  const [seciliFoto, fotoSec] = useState(0);
  const istek = useRef<AbortController | null>(null);
  const yukle = useCallback(() => {
    istek.current?.abort(); const kontrol = new AbortController(); istek.current = kontrol;
    yuklemeyiAyarla(true); hatayiAyarla(null); ayarla(null); duzenlemeyiAyarla(ilkDuzenle); kaydiAyarla(false); fotoSec(0);
    void galeriDetayiniGetir(kullaniciId, id, kontrol.signal).then((veri) => {
      if (!kontrol.signal.aborted) { ayarla(veri); fotoSec(Math.min(ilkFoto, Math.max(0, veri.ani.fotograflar.length - 1))); }
    }).catch((sorun: unknown) => {
      if (!kontrol.signal.aborted) hatayiAyarla(sorun instanceof Error ? sorun.message : 'Anı yüklenemedi. Tekrar dene.');
    }).finally(() => { if (!kontrol.signal.aborted) yuklemeyiAyarla(false); });
  }, [kullaniciId, id, ilkFoto, ilkDuzenle]);
  useFocusEffect(useCallback(() => { yukle(); return () => istek.current?.abort(); }, [yukle]));
  return <Sayfa>
    {!duzenliyor && <Dugme baslik="‹ Galeriye dön" ikincil tiklaninca={() => router.replace('/galeri')} />}
    {yukleniyor ? <ActivityIndicator accessibilityLabel="Anı yükleniyor" color={RENKLER.ana} /> : hata ? <>
      <Text accessibilityRole="alert" style={ORTAK.hata}>{hata}</Text><Dugme baslik="Tekrar dene" tiklaninca={yukle} />
    </> : bilgi && <>
      <AniGalerisi fotograflar={bilgi.ani.fotograflar} secili={seciliFoto} degistir={fotoSec} />
      {!duzenliyor && <Dugme baslik="Tam ekran görüntüle" ikincil tiklaninca={() => router.push({ pathname: '/fotograf/[id]', params: { id, foto: String(seciliFoto) } })} />}
      {duzenliyor ? <AniDuzenlemeFormu ani={bilgi.ani} kullaniciId={kullaniciId}
        vazgec={() => { if (donus) donusuAyarla(false); else duzenlemeyiAyarla(false); }} tamamlandi={(ani) => {
          if (donus) { donusuAyarla(true); return; }
          ayarla({ ...bilgi, ani: { ...bilgi.ani, ...ani } }); duzenlemeyiAyarla(false); kaydiAyarla(true);
        }} /> : <>
        <Text accessibilityRole="header" style={ORTAK.baslik}>{bilgi.ani.title}</Text>
        <Text style={ORTAK.metin}>{new Date(`${bilgi.ani.memory_date}T12:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}</Text>
        <DuyguEtiketi kod={bilgi.duygu} />
        {bilgi.ani.analizDurumu && bilgi.ani.analizDurumu !== 'not_required' &&
          <Dugme baslik={bilgi.ani.analizDurumu === 'completed' ? 'Duyguyu Değiştir' : 'Analiz durumunu gör'} ikincil
            tiklaninca={() => router.push({ pathname: bilgi.ani.analizDurumu === 'completed' ? '/duygu-duzenle' : '/analiz', params: { memoryId: id } })} />}
        <Text style={[ORTAK.metin, { color: RENKLER.yazi, fontSize: 16 }]}>{bilgi.ani.description || 'Açıklama eklenmemiş.'}</Text>
        {bilgi.ani.fotograflar.length > 1 && <>
          <Text style={ORTAK.etiket}>Diğer Fotoğraflar</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{bilgi.ani.fotograflar.map((foto, i) =>
            <Pressable key={foto.yol} accessibilityRole="button" accessibilityLabel={`Fotoğraf ${i + 1} göster`} accessibilityState={{ selected: seciliFoto === i }}
              onPress={() => fotoSec(i)} style={{ width: '22%', aspectRatio: 1, borderRadius: 16, borderWidth: 2, padding: 2,
                backgroundColor: RENKLER.yumusak, borderColor: seciliFoto === i ? RENKLER.ana : 'transparent' }}>
              {foto.url ? <Image source={{ uri: foto.url }} style={{ width: '100%', height: '100%', borderRadius: 12 }} /> : <Text style={ORTAK.metin}>Fotoğraf {i + 1}</Text>}
            </Pressable>)}</View>
        </>}
        {kaydedildi && <Text accessibilityLiveRegion="polite" style={ORTAK.metin}>Değişikliklerin kaydedildi.</Text>}
        <Dugme baslik="Düzenle" tiklaninca={() => { duzenlemeyiAyarla(true); kaydiAyarla(false); }} />
        <Dugme baslik="Sil · Yakında" ikincil devreDisi tiklaninca={() => {}} />
        <Dugme baslik="Fotoğrafları ve bilgileri yenile" ikincil tiklaninca={yukle} />
      </>}
    </>}
  </Sayfa>;
}
