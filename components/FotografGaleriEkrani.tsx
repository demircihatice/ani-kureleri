import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { usePreventRemove } from 'expo-router/react-navigation';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useOturum } from '../hooks/useOturum';
import { useGaleri } from '../hooks/useGaleri';
import { ORTAK, RENKLER } from '../constants/tema';
import { duyguSunumu, type DuyguFiltresi } from '../constants/duyguSunumu';
import { useGaleriYogunlugu } from '../hooks/useGaleriYogunlugu';
import { StatusBar } from 'expo-status-bar';
import type { GaleriAnisi } from '../types/galeri';
import { AltGezinme } from './ui/AltGezinme';
import { DuyguFiltreleri } from './ui/DuyguSecimi';
import { Dugme } from './Dugme';
import { galeriBaglaminiHazirla } from '../lib/galeriViewerBaglami';
import { galeriFotograflariniSil } from '../services/galleryDeleteService';

export function FotografKaresi({ fotograf, ac, secimeBasla, secimModu = false, secili = false, devreDisi = false }: {
  fotograf: GaleriAnisi; ac?: (fotograf: GaleriAnisi) => void; secimeBasla?: (fotograf: GaleriAnisi) => void;
  secimModu?: boolean; secili?: boolean; devreDisi?: boolean;
}) {
  const [hata, ayarla] = useState(false);
  return <Pressable accessibilityRole={secimModu ? 'checkbox' : 'button'}
    accessibilityLabel={`${fotograf.baslik}, fotoğraf ${(fotograf.fotografSirasi ?? 0) + 1}. ${secimModu ? 'Fotoğraf seçimi' : 'Anıyı aç'}`}
    accessibilityHint={secimModu ? undefined : 'Seçmek için basılı tut'} accessibilityState={{ checked: secimModu ? secili : undefined, disabled: devreDisi }}
    disabled={devreDisi} onLongPress={() => secimeBasla?.(fotograf)} delayLongPress={400}
    onPress={() => ac ? ac(fotograf) : router.push({ pathname: '/fotograf/[id]', params: { id: fotograf.id, foto: String(fotograf.fotografSirasi ?? 0) } })}
    style={s.kare}>
    {fotograf.kapak && !hata ? <Image source={{ uri: fotograf.kapak }} resizeMode="cover" style={s.fotograf}
      accessibilityLabel={fotograf.baslik} onError={() => ayarla(true)} />
      : <View accessibilityLabel="Fotoğraf açılamadı" style={[s.fotograf, s.yedek]}><Text style={ORTAK.metin}>▧</Text></View>}
    {secimModu && <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: secili ? 3 : 0, borderColor: '#FFFFFF', backgroundColor: secili ? '#00000022' : 'transparent' }}>
      <View style={{ position: 'absolute', right: 4, bottom: 4, borderRadius: 12, backgroundColor: secili ? RENKLER.ana : '#FFFFFFCC' }}>
        <Ionicons name={secili ? 'checkmark-circle' : 'ellipse-outline'} color={secili ? '#FFFFFF' : '#555555'} size={22} accessible={false} />
      </View>
    </View>}
  </Pressable>;
}
export function FotografGaleriEkrani() {
  const { oturum } = useOturum();
  return <GaleriIcerigi key={oturum?.user.id ?? 'anon'} />;
}
function GaleriIcerigi() {
  const { oturum } = useOturum();
  const [secimModu, moduAyarla] = useState(false);
  const [secilenler, secimiAyarla] = useState<Record<string, GaleriAnisi>>({});
  const [siliyor, silmeyiAyarla] = useState(false);
  const [silmeHatasi, hatayiAyarla] = useState<string | null>(null);
  const [silmeOnayi, onayiAyarla] = useState(false);
  const kilit = useRef(false);
  const aktif = useRef(true);
  useEffect(() => { aktif.current = true; return () => { aktif.current = false; }; }, []);
  usePreventRemove(siliyor, () => Alert.alert('Fotoğraflar siliniyor', 'İşlem tamamlanana kadar bekle.'));
  const [filtre, sec] = useState<DuyguFiltresi>('tumu');
  const { sutun, pinch, listeRef, satirYuksekligi, panHandlers, sifirla, boyutDegisti, kaydirildi, capayiGeriYukle } = useGaleriYogunlugu();
  const duygu = duyguSunumu(filtre);
  const { veri, hata, yukleniyor, yenile, dahaFazla } = useGaleri(oturum?.user.id ?? '', filtre, false, true);
  function fotografiAc(foto: GaleriAnisi) {
    if (kilit.current) return;
    if (secimModu) { secimiDegistir(foto); return; }
    if (!veri || !oturum) return;
    const baglam = galeriBaglaminiHazirla(oturum.user.id, filtre, veri);
    router.push({ pathname: '/fotograf/[id]', params: { id: foto.id, foto: String(foto.fotografSirasi ?? 0), baglam } });
  }
  function secimiDegistir(foto: GaleriAnisi, basla = false) {
    if (kilit.current || !foto.fotografYolu) return;
    if (basla) moduAyarla(true);
    secimiAyarla(eski => {
      const yeni = { ...eski };
      if (basla || !yeni[foto.fotografYolu!]) yeni[foto.fotografYolu!] = foto;
      else delete yeni[foto.fotografYolu!];
      return yeni;
    });
    hatayiAyarla(null);
  }
  function secimiKapat() { if (!kilit.current) { moduAyarla(false); secimiAyarla({}); hatayiAyarla(null); onayiAyarla(false); } }
  async function sil() {
    if (kilit.current || !oturum || !Object.keys(secilenler).length) return;
    onayiAyarla(false);
    kilit.current = true; silmeyiAyarla(true); hatayiAyarla(null);
    try {
      await galeriFotograflariniSil(oturum.user.id, Object.values(secilenler));
      if (aktif.current) { moduAyarla(false); secimiAyarla({}); yenile(); }
    } catch (sorun) {
      if (aktif.current) hatayiAyarla(sorun instanceof Error ? sorun.message : 'Fotoğraflar silinemedi. Tekrar dene.');
    } finally { kilit.current = false; if (aktif.current) silmeyiAyarla(false); }
  }
  const resimler: (GaleriAnisi | null)[] = [...(veri?.anilar ?? [])];
  while (resimler.length % sutun) resimler.push(null);
  return <SafeAreaView edges={['top', 'left', 'right']} testID="galeri-zemini" style={[s.sayfa, { backgroundColor: duygu?.zemin ?? '#FFFFFF' }]}>
    <StatusBar style={duygu?.renk === '#FFFFFF' ? 'light' : 'dark'} />
    <View style={[s.ust, duygu && { backgroundColor: duygu.zemin }]}>
      <Text accessibilityRole="header" style={[ORTAK.baslik, { color: filtre === 'tumu' ? '#111111' : '#FFFFFF' }]}>Galeri</Text>
      <View pointerEvents={siliyor ? 'none' : 'auto'}><DuyguFiltreleri secili={filtre} sec={(kod) => { sifirla(); secimiKapat(); sec(kod); }} /></View>
      {secimModu && <View style={s.secimCubugu}>
        <Pressable accessibilityRole="button" accessibilityLabel="Seçimden vazgeç" disabled={siliyor} onPress={secimiKapat} style={s.secimTusu}><Text style={ORTAK.etiket}>Vazgeç</Text></Pressable>
        <Text accessibilityLiveRegion="polite" style={[ORTAK.etiket, { flex: 1, textAlign: 'center' }]}>{Object.keys(secilenler).length} seçildi</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Seçili fotoğrafları kalıcı sil" accessibilityHint="Geri alınamaz; son fotoğraf silinirse anı da kaldırılır"
          disabled={siliyor || !Object.keys(secilenler).length} accessibilityState={{ disabled: siliyor || !Object.keys(secilenler).length, busy: siliyor }}
          onPress={() => onayiAyarla(true)} style={[s.secimTusu, { opacity: Object.keys(secilenler).length ? 1 : 0.4 }]}>
          {siliyor ? <ActivityIndicator color={RENKLER.tehlike} /> : <Ionicons name="trash-outline" size={24} color={RENKLER.tehlike} accessible={false} />}
        </Pressable>
      </View>}
      {silmeHatasi && <View style={s.bilgi}><Text accessibilityRole="alert" style={ORTAK.hata}>{silmeHatasi}</Text></View>}
    </View>
    <View style={{ flex: 1 }} {...panHandlers} onLayout={boyutDegisti}>
    <FlatList ref={listeRef} key={sutun} accessibilityLabel={`Fotoğraf galerisi, ${sutun} sütun`} accessibilityHint="İki parmağını yaklaştırarak daha fazla fotoğraf göster"
      data={resimler} numColumns={sutun} scrollEnabled={!pinch && !siliyor} extraData={{ secimModu, secilenler, siliyor }}
      getItemLayout={satirYuksekligi && !hata ? (_, index) => ({ length: satirYuksekligi, offset: index * satirYuksekligi, index }) : undefined}
      onScroll={kaydirildi} scrollEventThrottle={32}
      onContentSizeChange={capayiGeriYukle}
      keyExtractor={(foto, i) => foto ? `${foto.id}:${foto.fotografYolu ?? i}` : `bos-${i}`}
      renderItem={({ item }) => item ? <FotografKaresi key={`${item.id}:${item.fotografYolu}:${item.kapak}`} fotograf={item} ac={fotografiAc}
        secimeBasla={foto => secimiDegistir(foto, true)} secimModu={secimModu} secili={!!secilenler[item.fotografYolu ?? '']} devreDisi={siliyor} /> : <View style={[s.kare, {backgroundColor: 'transparent'}]} />}
      columnWrapperStyle={s.satir} contentContainerStyle={s.icerik}
      refreshing={yukleniyor && !veri} onRefresh={siliyor ? undefined : yenile} initialNumToRender={40}
      onEndReached={() => { if (veri?.devamVar && !yukleniyor) void dahaFazla(); }} onEndReachedThreshold={0.6}
      ListHeaderComponent={hata ? <View style={s.bilgi}><Text accessibilityRole="alert" style={ORTAK.hata}>{hata}</Text>
        <Dugme baslik="Tekrar dene" ikincil bekliyor={yukleniyor} tiklaninca={yenile} /></View> : null}
      ListEmptyComponent={!yukleniyor && !hata && veri ? <View style={s.bilgi}>
        <Text style={ORTAK.metin}>{filtre === 'tumu' ? 'Fotoğrafların burada bir araya gelecek.'
          : 'Henüz bu kategoride bir anı bulunmuyor.'}</Text>
      </View> : null}
      ListFooterComponent={yukleniyor ? <ActivityIndicator accessibilityLabel="Fotoğraflar yükleniyor" color={duygu?.renk ?? RENKLER.ana} style={{ padding: 20 }} /> : null} />
    </View><View pointerEvents={siliyor ? 'none' : 'auto'}><AltGezinme etkin="/galeri" /></View>
    {silmeOnayi && <Modal transparent animationType="fade" visible onRequestClose={secimiKapat}>
      <View style={s.onayZemini}>
        <View accessibilityViewIsModal style={s.onayKarti}>
          <Text accessibilityRole="header" style={[ORTAK.baslik, { fontSize: 22 }]}>Anılar silinsin mi?</Text>
          <Text style={ORTAK.metin}>Seçtiğin anıları silmek istediğine emin misin?</Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Silmekten vazgeç" onPress={secimiKapat}
              style={[s.onayTusu, { backgroundColor: RENKLER.yumusak }]}><Text style={ORTAK.etiket}>Vazgeç</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Kalıcı silmeyi onayla" onPress={() => void sil()}
              style={[s.onayTusu, { backgroundColor: RENKLER.tehlike }]}><Text style={{ color: '#FFFFFF', fontWeight: '600', fontSize: 16 }}>Sil</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>}
  </SafeAreaView>;
}
const s = StyleSheet.create({
  sayfa: { flex: 1, backgroundColor: RENKLER.zemin },
  secimCubugu: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFFFFF', borderRadius: 18, paddingHorizontal: 4 },
  secimTusu: { flex: 1, minWidth: 48, minHeight: 44, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  onayZemini: { flex: 1, backgroundColor: '#00000066', justifyContent: 'center', alignItems: 'center', padding: 24 },
  onayKarti: { width: '100%', maxWidth: 400, backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, gap: 18 },
  onayTusu: { flex: 1, minHeight: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', padding: 12 },
  ust: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, gap: 8, backgroundColor: RENKLER.yuzey },
  icerik: { paddingBottom: 2, gap: 2 }, satir: { gap: 2 },
  kare: { flex: 1, aspectRatio: 1, minWidth: 0, backgroundColor: RENKLER.yumusak },
  fotograf: { width: '100%', height: '100%' },
  yedek: { alignItems: 'center', justifyContent: 'center' }, bilgi: { padding: 22, margin: 16, borderRadius: 20, borderWidth: 1, borderColor: RENKLER.kenar, backgroundColor: RENKLER.yuzey, gap: 14 },
});
