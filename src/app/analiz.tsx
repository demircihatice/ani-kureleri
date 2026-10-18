import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';
import { Sayfa } from '../../components/Sayfa';
import { Dugme } from '../../components/Dugme';
import { AnaKure } from '../../components/ui/AnaKure';
import { DUYGU_SUNUMU } from '../../constants/duyguSunumu';
import { ORTAK, RENKLER } from '../../constants/tema';
import { simulasyonGorunur } from '../../constants/api';
import { useOturum } from '../../hooks/useOturum';
import { useAnaliz } from '../../hooks/useAnaliz';
import { ANALIZ_METINLERI, kureyiSimuleEt } from '../../services/analysisService';
export default function AnalizEkrani() {
  const { memoryId } = useLocalSearchParams<{memoryId:string}>();
  const { oturum } = useOturum();
  const id = typeof memoryId==='string' ? memoryId:'';
  return <AnalizIcerigi key={`${oturum?.user.id}:${id}`} kullaniciId={oturum?.user.id ?? ''} id={id} />;
}
export function AnalizIcerigi({kullaniciId,id}:{kullaniciId:string;id:string}) {
  const {veri,hata,yukleniyor,zamanDoldu,yenile} = useAnaliz(kullaniciId,id);
  const [bekliyor,ayarla] = useState(false);
  const [tetikHatasi,hatayiAyarla] = useState<string|null>(null);
  const istek = useRef<AbortController|null>(null);
  const etkin = useRef(false);
  useFocusEffect(useCallback(() => {
    etkin.current=true;
    return () => { etkin.current=false; istek.current?.abort(); };
  },[]));
  useEffect(() => {
    if (veri?.status==='completed') router.replace({pathname:'/analiz-sonucu',params:{memoryId:id}});
  },[veri?.status,id]);
  async function simuleEt() {
    if (istek.current || !simulasyonGorunur()) return;
    const kontrol = new AbortController(); istek.current=kontrol; ayarla(true); hatayiAyarla(null);
    try { await kureyiSimuleEt(id,kontrol.signal); if (etkin.current) yenile(); }
    catch { if (etkin.current) hatayiAyarla('Tetik sonucu doğrulanamadı. Durumu yenileyip kontrol et.'); }
    finally { istek.current=null; if (etkin.current) ayarla(false); }
  }
  const durum = veri?.status;
  return <Sayfa ortala>
    <Text accessibilityRole="header" style={ORTAK.baslik}>Ana Küre ile Analiz</Text>
    <AnaKure buyuk />
    <Text accessibilityLiveRegion="polite" style={[ORTAK.etiket,{fontSize:21,textAlign:'center'}]}>{durum ? ANALIZ_METINLERI[durum]:'Analiz başlatılmadı'}</Text>
    {yukleniyor && id && <ActivityIndicator accessibilityLabel="Analiz durumu alınıyor" color={RENKLER.ana} />}
    {hata && <Text accessibilityRole="alert" style={ORTAK.hata}>{hata}</Text>}
    {!id && <Text style={ORTAK.metin}>Anın kaydedilmedi. Yeni Anı ekranında API bağlantısı etkinleştirildikten sonra başlayabilirsin.</Text>}
    {durum==='queued' && <Text style={ORTAK.metin}>Görüntü işleme modeli henüz bağlı değil. Anın sırada tutuluyor; bu aşamada otomatik sonuç üretilmeyecek.</Text>}
    {durum==='awaiting_nfc' && <Text style={ORTAK.metin}>Anın kaydedildi. Gerçek Ana Küre bağlantısı henüz hazır değil.</Text>}
    {zamanDoldu && <Text style={ORTAK.metin}>Otomatik durum kontrolü durduruldu. İstersen daha sonra yenileyebilirsin.</Text>}
    <View style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'center',gap:10}}>{DUYGU_SUNUMU.map((duygu) =>
      <Text key={duygu.kod} accessibilityLabel={duygu.ad} style={{color:duygu.renk,backgroundColor:duygu.zemin,borderRadius:20,padding:12,fontSize:23}}>{duygu.ikon}</Text>)}</View>
    {simulasyonGorunur() && durum==='awaiting_nfc' && <Dugme baslik="Ana Küreyi Simüle Et" ikincil bekliyor={bekliyor} tiklaninca={() => void simuleEt()} />}
    {tetikHatasi && <Text accessibilityRole="alert" style={ORTAK.hata}>{tetikHatasi}</Text>}
    {!!id && <Dugme baslik="Durumu yenile" ikincil tiklaninca={yenile} />}
    <Dugme baslik="Galeriye Dön" ikincil tiklaninca={() => router.replace('/galeri')} />
  </Sayfa>;
}
