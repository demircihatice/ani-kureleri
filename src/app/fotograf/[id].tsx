import { ActivityIndicator, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router, useLocalSearchParams } from 'expo-router';
import { useOturum } from '../../../hooks/useOturum';
import { useViewerAnisi } from '../../../hooks/useViewerAnisi';
import { PhotoViewer } from '../../../components/PhotoViewer';
import { Dugme } from '../../../components/Dugme';
import { useGaleriViewer } from '../../../hooks/useGaleriViewer';

export default function FotografRotasi() {
  const { id, foto, baglam } = useLocalSearchParams<{ id: string; foto?: string; baglam?: string }>();
  const { oturum } = useOturum();
  const ilkFoto = typeof foto === 'string' && /^[0-4]$/.test(foto) ? Number(foto) : 0;
  if (typeof baglam === 'string') return <GaleriFotografEkrani key={`${oturum?.user.id}:${baglam}`}
    kullaniciId={oturum?.user.id ?? ''} baglamId={baglam} id={typeof id === 'string' ? id : ''} ilkFoto={ilkFoto} />;
  return <FotografEkrani key={`${oturum?.user.id}:${id}`} kullaniciId={oturum?.user.id ?? ''} id={typeof id === 'string' ? id : ''} ilkFoto={ilkFoto} />;
}
export function GaleriFotografEkrani({ kullaniciId, baglamId, id, ilkFoto }: { kullaniciId: string; baglamId: string; id: string; ilkFoto: number }) {
  const galeri = useGaleriViewer(kullaniciId, baglamId, id, ilkFoto);
  const geri = () => { if (router.canGoBack()) router.back(); else router.replace('/galeri'); };
  return <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}><StatusBar style="dark" />
    {galeri.gecerli ? <PhotoViewer bilgi={galeri.bilgi} galeri={galeri} geri={geri} yenile={galeri.yenile} /> : <>
      <Text style={{ color: '#202020', padding: 24 }}>Galeriye dönüp fotoğrafı yeniden aç.</Text><Dugme baslik="Galeriye dön" tiklaninca={geri} />
    </>}
  </SafeAreaView>;
}
export function FotografEkrani({ kullaniciId, id, ilkFoto }: { kullaniciId: string; id: string; ilkFoto: number }) {
  const { veri, hata, yenile } = useViewerAnisi(kullaniciId, id);
  const geri = () => { if (router.canGoBack()) router.back(); else router.replace('/galeri'); };
  return <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
    <StatusBar style="dark" />
    {veri && veri.ani.fotograflar.length ? <PhotoViewer bilgi={veri} ilkFoto={ilkFoto} geri={geri} yenile={yenile} /> : <>
      <Dugme baslik="Galeriye dön" ikincil tiklaninca={geri} />
      {hata || veri ? <><Text accessibilityRole="alert" style={{ color: '#202020', padding: 24 }}>{hata ?? 'Bu anıda fotoğraf yok.'}</Text><Dugme baslik="Tekrar dene" tiklaninca={yenile} /></>
        : <ActivityIndicator accessibilityLabel="Fotoğraflar yükleniyor" color="#333333" />}
    </>}
  </SafeAreaView>;
}
