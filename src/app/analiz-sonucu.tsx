import { ActivityIndicator, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Sayfa } from '../../components/Sayfa';
import { Dugme } from '../../components/Dugme';
import { AnalizSonucu } from '../../components/AnalizSonucu';
import { useOturum } from '../../hooks/useOturum';
import { useApiAni } from '../../hooks/useApiAni';
import { duyguSunumu } from '../../constants/duyguSunumu';
import { ORTAK } from '../../constants/tema';
export default function SonucEkrani() {
  const {memoryId} = useLocalSearchParams<{memoryId:string}>();
  const id = typeof memoryId==='string' ? memoryId:'';
  const {oturum} = useOturum();
  const {veri,hata} = useApiAni(oturum?.user.id ?? '',id);
  const ani = veri?.ani;
  const duygu = duyguSunumu(ani?.final_emotion?.code);
  return <Sayfa>
    {hata ? <Text accessibilityRole="alert" style={ORTAK.hata}>{hata}</Text> : !ani ? <ActivityIndicator accessibilityLabel="Sonuç yükleniyor" />
      : ani.analysis_status==='completed' && duygu ? <>
        <AnalizSonucu sonuc={{duygu:duygu.kod,baslik:ani.title,tarih:ani.memory_date,
          kapak:ani.cover ? veri?.imzalar.get(ani.cover.storage_path) ?? null:null}}
          galeriyeDon={() => router.replace('/galeri')}
          duyguDegistir={() => router.push({pathname:'/duygu-duzenle',params:{memoryId:id}})} />
        <Text style={ORTAK.metin}>İlk model tahmini: {duyguSunumu(ani.predicted_emotion?.code)?.ad ?? 'Belirtilmemiş'}. Duygu düzeltmeleri ilk tahmini değiştirmez.</Text>
      </> : <Text style={ORTAK.metin}>Henüz tamamlanmış bir analiz sonucu yok.</Text>}
    <Dugme baslik="Analiz durumuna dön" ikincil tiklaninca={() => router.replace({pathname:'/analiz',params:{memoryId:id}})} />
  </Sayfa>;
}
