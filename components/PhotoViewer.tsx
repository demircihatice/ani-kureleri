import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useFotoBilgiPaneli } from '../hooks/useFotoBilgiPaneli';
import type { ViewerAnisi } from '../hooks/useViewerAnisi';
import { ThumbnailStrip } from './ThumbnailStrip';
import { PhotoInfoSheet } from './PhotoInfoSheet';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { useGaleriViewer } from '../hooks/useGaleriViewer';
import { router } from 'expo-router';
import { useOturum } from '../hooks/useOturum';
import { duzenlemeDonusunuHazirla } from '../lib/aniDuzenlemeDonusu';

type GaleriGezintisi = ReturnType<typeof useGaleriViewer>;

function ViewerFotografi({ url, sira }: { url: string | null; sira: number }) {
  const [hata, ayarla] = useState(false);
  return url && !hata ? <Image source={{ uri: url }} resizeMode="contain" accessibilityLabel={`Anı fotoğrafı ${sira + 1}`}
    style={{ flex: 1, width: '100%', height: '100%' }} onError={() => ayarla(true)} />
    : <View style={s.yedek}><Text style={s.metin}>Fotoğraf açılamadı. Galeriye dönüp tekrar açabilirsin.</Text></View>;
}
export function PhotoViewer({ bilgi, ilkFoto = 0, geri, yenile, galeri }: {
  bilgi: ViewerAnisi | null; ilkFoto?: number; geri: () => void; yenile: () => void; galeri?: GaleriGezintisi;
}) {
  const { width, height } = useWindowDimensions();
  const fotograflar = galeri?.fotograflar ?? bilgi?.ani.fotograflar ?? [];
  const [yerelSecili, ayarla] = useState(() => Math.max(0, Math.min(ilkFoto, fotograflar.length - 1)));
  const secili = galeri?.secili ?? yerelSecili;
  const [genislik, genislikAyarla] = useState(width);
  const [alanYuksekligi, yukseklikAyarla] = useState(Math.max(1, height - 168));
  const liste = useRef<FlatList<ViewerAnisi['ani']['fotograflar'][number]>>(null);
  const panelYuksekligi = Math.min(520, height * 0.7);
  const { acik, konum, panHandlers, ac, kapat } = useFotoBilgiPaneli(panelYuksekligi);
  const { oturum } = useOturum();
  const kullaniciId = oturum?.user.id ?? '';
  const donusuTemizle = useRef<(() => void) | null>(null);
  useEffect(() => () => { donusuTemizle.current?.(); }, [kullaniciId]);
  function duzenle() {
    if (!bilgi || !kullaniciId) return;
    donusuTemizle.current?.();
    const donus = duzenlemeDonusunuHazirla(kullaniciId, bilgi.ani.id, kaydedildi => {
      if (kaydedildi) { yenile(); ac(); } else kapat();
    });
    donusuTemizle.current = donus.temizle;
    kapat();
    router.push({ pathname: '/ani/[id]', params: { id: bilgi.ani.id,
      foto: String(galeri ? galeri.fotograflar[secili]?.fotografSirasi ?? 0 : secili), duzenle: '1', donus: donus.kimlik } });
  }
  usePreventRemove(acik, kapat);
  useEffect(() => { liste.current?.scrollToOffset({ offset: secili * genislik, animated: false }); }, [genislik, secili]);
  const sec = useCallback((sira: number) => {
    const hedef = Math.max(0, Math.min(fotograflar.length - 1, sira));
    if (galeri) galeri.sec(hedef); else ayarla(hedef);
  }, [fotograflar.length, galeri]);
  return <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} {...panHandlers}>
    <View style={{ flex: 1 }} accessibilityElementsHidden={acik} importantForAccessibility={acik ? 'no-hide-descendants' : 'auto'}>
    <View style={s.ust}>
      <Pressable accessibilityRole="button" accessibilityLabel="Galeriye dön" onPress={() => { if (acik) kapat(); else geri(); }} style={s.tus}>
        <Ionicons name="chevron-back" size={28} color="#202020" accessible={false} />
      </Pressable>
    </View>
    <View style={{ flex: 1 }} onLayout={e => { genislikAyarla(e.nativeEvent.layout.width); yukseklikAyarla(e.nativeEvent.layout.height); }}>
      <FlatList key={genislik} ref={liste} horizontal pagingEnabled data={fotograflar} extraData={secili}
        accessibilityActions={[{ name: 'bilgileriAc', label: 'Fotoğraf bilgilerini aç' }]}
        onAccessibilityAction={e => { if (e.nativeEvent.actionName === 'bilgileriAc') ac(); }}
        accessibilityLabel="Tam ekran fotoğraflar" accessibilityHint="Fotoğraf değiştirmek için yana, bilgileri açmak için yukarı kaydır"
        initialScrollIndex={secili} initialNumToRender={1} maxToRenderPerBatch={3} windowSize={3}
        showsHorizontalScrollIndicator={false} scrollEnabled={!acik} keyExtractor={f => f.yol}
        getItemLayout={(_, index) => ({ length: genislik, offset: genislik * index, index })}
        onMomentumScrollEnd={e => sec(Math.round(e.nativeEvent.contentOffset.x / genislik))}
        renderItem={({ item, index }) => <View style={{ width: genislik, height: alanYuksekligi }}>
          {Math.abs(index - secili) <= 1 && <ViewerFotografi key={`${item.yol}:${item.url}`} url={item.url} sira={index} />}
        </View>} />
    </View>
    <View style={s.alt}>
      <ThumbnailStrip fotograflar={fotograflar} secili={secili} sec={sec} dahaFazla={galeri?.devamVar ? () => { void galeri.dahaFazla(); } : undefined}
        yukleniyor={galeri?.yukleniyor} hata={galeri?.hata} />
    </View>
    </View>
    {acik && <PhotoInfoSheet bilgi={bilgi} duzenle={duzenle}
      konum={konum} yukseklik={panelYuksekligi} hata={galeri?.bilgiHatasi} />}
  </View>;
}
const s = StyleSheet.create({ ust: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8 },
  tus: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  alt: { paddingTop: 16, paddingBottom: 16 },
  metin: { color: '#202020', fontSize: 14 }, yedek: { flex: 1, justifyContent: 'center', padding: 24 } });
