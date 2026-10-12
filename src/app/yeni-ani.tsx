import { useEffect, useRef, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { randomUUID } from 'expo-crypto';
import { Sayfa } from '../../components/Sayfa';
import { Dugme } from '../../components/Dugme';
import { AniTarihi } from '../../components/AniTarihi';
import { RENKLER } from '../../constants/tema';
import { DUYGULAR } from '../../constants/duygular';
import { useOturum } from '../../hooks/useOturum';
import { useKureler } from '../../hooks/useKureler';
import { aniFormunuDogrula, yerelTarih } from '../../lib/aniDogrulama';
import { galeridenSec } from '../../services/photoService';
import { AniKayitHatasi, aniyiKaydet } from '../../services/memoryService';
import type { AniDenemesi, AniFormu } from '../../types/ani';

export default function YeniAni() {
  const { oturum } = useOturum();
  const kullaniciId = oturum?.user.id ?? '';
  const { set, yukleniyor, hata: kureHatasi, yenile } = useKureler(kullaniciId);
  const [form, ayarla] = useState<AniFormu>({ baslik: '', aciklama: '', tarih: yerelTarih(new Date()), kureId: '', fotograflar: [] });
  const [bekliyor, beklemeyiAyarla] = useState(false);
  const [belirsiz, belirsiziAyarla] = useState(false);
  const [hata, hatayiAyarla] = useState<string | null>(null);
  const [ilerleme, ilerlemeyiAyarla] = useState('');
  const [kaydedilenKure, kaydedilenKureyiAyarla] = useState<string | null>(null);
  const deneme = useRef<AniDenemesi | null>(null);
  const istekSuruyor = useRef(false);
  const etkin = useRef(true);
  useEffect(() => { etkin.current = true; return () => { etkin.current = false; }; }, []);
  const kilitli = bekliyor || belirsiz;
  usePreventRemove(kilitli, () => {
    Alert.alert('İşlem sürüyor', 'Kayıt tamamlanana kadar bu ekranda kal. Sonuç belirsizse aynı kaydı tekrar dene.');
  });
  useEffect(() => {
    if (kaydedilenKure && !kilitli) router.replace({ pathname: '/kure/[id]', params: { id: kaydedilenKure, kaydedildi: '1' } });
  }, [kaydedilenKure, kilitli]);

  async function sec() {
    if (istekSuruyor.current || belirsiz) return;
    istekSuruyor.current = true; beklemeyiAyarla(true); hatayiAyarla(null);
    try {
      const fotograflar = await galeridenSec();
      if (fotograflar && etkin.current) ayarla((eski) => ({ ...eski, fotograflar }));
    } catch {
      if (etkin.current) hatayiAyarla('Fotoğraflar seçilemedi. En fazla 5 fotoğraf seçip tekrar dene.');
    } finally {
      istekSuruyor.current = false;
      if (etkin.current) beklemeyiAyarla(false);
    }
  }

  async function kaydet() {
    if (istekSuruyor.current || !kullaniciId) return;
    const sorun = aniFormunuDogrula(form, set?.kureler.map((kure) => kure.id) ?? []);
    if (sorun) { hatayiAyarla(sorun); return; }
    istekSuruyor.current = true; beklemeyiAyarla(true); hatayiAyarla(null);
    try {
      if (!deneme.current) {
        const id = randomUUID();
        deneme.current = { id, kullaniciId, form: { ...form, fotograflar: [...form.fotograflar] },
          yollar: form.fotograflar.map((_, i) => `${kullaniciId}/${id}/${i}.jpg`), yuklemeTamam: false };
      }
      await aniyiKaydet(deneme.current, (mesaj) => { if (etkin.current) ilerlemeyiAyarla(mesaj); });
      if (etkin.current) {
        belirsiziAyarla(false);
        kaydedilenKureyiAyarla(deneme.current.form.kureId);
      }
    } catch (sorun) {
      const sonucBelirsiz = sorun instanceof AniKayitHatasi && sorun.belirsiz;
      if (!sonucBelirsiz) deneme.current = null;
      if (etkin.current) {
        belirsiziAyarla(sonucBelirsiz);
        hatayiAyarla(sorun instanceof AniKayitHatasi ? sorun.message : 'İşlem tamamlanamadı. Tekrar dene.');
      }
    } finally {
      istekSuruyor.current = false;
      if (etkin.current) { beklemeyiAyarla(false); ilerlemeyiAyarla(''); }
    }
  }

  return <Sayfa>
    <Text accessibilityRole="header" style={stiller.baslik}>Yeni Anı Ekle</Text>
    <Text style={stiller.metin}>Bir anı, bir duygu. Küreni kendin seç.</Text>
    <Dugme baslik={form.fotograflar.length ? 'Fotoğrafları yeniden seç' : 'Galeriden fotoğraf seç'} ikincil devreDisi={kilitli} tiklaninca={() => void sec()} />
    <Text style={stiller.metin}>1–5 fotoğraf. İlk fotoğraf anının kapağıdır.</Text>
    <View style={stiller.fotograflar}>
      {form.fotograflar.map((fotograf, i) => <View key={`${fotograf.uri}-${i}`} style={{ gap: 6 }}>
        <Image source={{ uri: fotograf.uri }} style={stiller.fotograf} accessibilityLabel={`Seçilen fotoğraf ${i + 1}`} />
        <Pressable disabled={kilitli} accessibilityRole="button" accessibilityLabel={`Fotoğraf ${i + 1} kaldır`}
          onPress={() => ayarla((eski) => ({ ...eski, fotograflar: eski.fotograflar.filter((_, sira) => sira !== i) }))}>
          <Text style={stiller.kaldir}>Kaldır</Text>
        </Pressable>
      </View>)}
    </View>
    <Text style={stiller.etiket}>Başlık *</Text>
    <TextInput accessibilityLabel="Anı başlığı" value={form.baslik} editable={!kilitli} maxLength={200}
      onChangeText={(baslik) => ayarla((eski) => ({ ...eski, baslik }))} style={stiller.girdi} />
    <Text style={stiller.etiket}>Açıklama</Text>
    <TextInput accessibilityLabel="Anı açıklaması" value={form.aciklama} editable={!kilitli} multiline maxLength={5000}
      onChangeText={(aciklama) => ayarla((eski) => ({ ...eski, aciklama }))} style={[stiller.girdi, { minHeight: 100, textAlignVertical: 'top' }]} />
    <Text style={stiller.etiket}>Anı tarihi *</Text>
    <AniTarihi deger={form.tarih} devreDisi={kilitli} degistir={(tarih) => ayarla((eski) => ({ ...eski, tarih }))} />
    <Text style={stiller.etiket}>Duygu küresi *</Text>
    {kureHatasi ? <><Text accessibilityRole="alert" style={stiller.hata}>{kureHatasi}</Text>
      <Dugme baslik="Küreleri tekrar yükle" ikincil devreDisi={kilitli} tiklaninca={yenile} /></>
      : yukleniyor ? <Text style={stiller.metin}>Küreler yükleniyor…</Text>
        : !set?.kureler.length ? <Text style={stiller.hata}>Kürelerin henüz hazır değil. Ana sayfadan kontrol et.</Text>
          : set.kureler.map((kure) => <Pressable key={kure.id} accessibilityRole="radio"
            accessibilityState={{ checked: form.kureId === kure.id, disabled: kilitli }} disabled={kilitli}
            onPress={() => ayarla((eski) => ({ ...eski, kureId: kure.id }))}
            style={[stiller.secim, { borderColor: form.kureId === kure.id ? RENKLER.yazi : '#D4CDDD' }]}>
            <View style={[stiller.renk, { backgroundColor: DUYGULAR.find((d) => d.tur === kure.emotion_type)?.renk }]} />
            <Text style={stiller.etiket}>{kure.name}{form.kureId === kure.id ? ' ✓' : ''}</Text>
          </Pressable>)}
    {hata && <Text accessibilityRole="alert" style={stiller.hata}>{hata}</Text>}
    {!!ilerleme && <Text accessibilityLiveRegion="polite" style={stiller.metin}>{ilerleme}</Text>}
    <Dugme baslik={belirsiz ? 'Aynı kaydı tekrar dene' : 'Kaydet'} bekliyor={bekliyor}
      devreDisi={yukleniyor || !set?.kureler.length} tiklaninca={() => void kaydet()} />
    {!kilitli && <Dugme baslik="Kürelerime dön" ikincil tiklaninca={() => router.replace('/ana-sayfa')} />}
  </Sayfa>;
}

const stiller = StyleSheet.create({
  baslik: { fontSize: 30, fontWeight: '700', color: RENKLER.yazi },
  metin: { color: RENKLER.ikincil, lineHeight: 23 },
  etiket: { color: RENKLER.yazi, fontWeight: '600' },
  girdi: { minHeight: 48, borderWidth: 1, borderColor: '#D4CDDD', borderRadius: 12, padding: 12, color: RENKLER.yazi, fontSize: 16, backgroundColor: '#FFFFFF' },
  fotograflar: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  fotograf: { width: 100, height: 100, borderRadius: 16 },
  kaldir: { color: RENKLER.ikincil, textAlign: 'center', paddingVertical: 8 },
  secim: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderWidth: 2, borderRadius: 16, backgroundColor: '#FFFFFF' },
  renk: { width: 24, height: 24, borderRadius: 12 },
  hata: { color: '#9F303B', lineHeight: 23 },
});
