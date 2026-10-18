import { useEffect, useRef, useState } from 'react';
import { Alert, Image, Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { randomUUID } from 'expo-crypto';
import { Sayfa } from '../../components/Sayfa';
import { Dugme } from '../../components/Dugme';
import { AniTarihi } from '../../components/AniTarihi';
import { AltGezinme } from '../../components/ui/AltGezinme';
import { ORTAK, RENKLER } from '../../constants/tema';
import { yeniAniTarihiniDogrula, yerelTarih } from '../../lib/aniDogrulama';
import { galeridenSec } from '../../services/photoService';
import type { SecilenFotograf } from '../../types/ani';
import { useOturum } from '../../hooks/useOturum';
import { memoryApiEtkin } from '../../constants/api';
import { analizIcinAniOlustur, YeniAniHatasi, type YeniAniDenemesi } from '../../services/newMemoryService';
export default function YeniAni() {
  const { oturum } = useOturum();
  const kullaniciId = oturum?.user.id ?? '';
  return <YeniAniFormu key={kullaniciId} kullaniciId={kullaniciId} />;
}
function YeniAniFormu({ kullaniciId }: { kullaniciId: string }) {
  const [form, ayarla] = useState({ baslik: '', aciklama: '', tarih: yerelTarih(new Date()), fotograflar: [] as SecilenFotograf[] });
  const [bekliyor, beklemeyiAyarla] = useState(false);
  const [hata, hatayiAyarla] = useState<string | null>(null);
  const [belirsiz, belirsiziAyarla] = useState(false);
  const [ilerleme, ilerlemeyiAyarla] = useState('');
  const [kayitId, kaydiAyarla] = useState<string | null>(null);
  const deneme = useRef<YeniAniDenemesi | null>(null);
  const kilit = useRef(false);
  const kilitli = bekliyor || belirsiz;
  usePreventRemove(kilitli, () => Alert.alert('Kayıt sürüyor', 'Kayıt tamamlanana kadar bekle. Sonuç belirsizse aynı kaydı tekrar dene.'));
  useEffect(() => {
    if (kayitId && !kilitli) router.replace({ pathname: '/analiz', params: { memoryId: kayitId } });
  }, [kayitId, kilitli]);
  async function sec() {
    if (kilit.current || belirsiz) return;
    kilit.current = true; beklemeyiAyarla(true); hatayiAyarla(null);
    try {
      const fotograflar = await galeridenSec(5 - form.fotograflar.length);
      if (fotograflar) ayarla((eski) => ({ ...eski, fotograflar: [...eski.fotograflar, ...fotograflar]
        .filter((foto, i, tum) => tum.findIndex((diger) => diger.uri === foto.uri) === i).slice(0, 5) }));
    } catch { hatayiAyarla('Fotoğraflar seçilemedi. En fazla 5 fotoğraf seçip tekrar dene.'); }
    finally { kilit.current = false; beklemeyiAyarla(false); }
  }
  async function analizeGit() {
    if (kilit.current) return;
    if (!form.fotograflar.length) { hatayiAyarla('En az bir fotoğraf seç.'); return; }
    if (!form.baslik.trim()) { hatayiAyarla('Bir başlık gir.'); return; }
    const tarihHatasi = yeniAniTarihiniDogrula(form.tarih);
    if (tarihHatasi) { hatayiAyarla(tarihHatasi); return; }
    if (!memoryApiEtkin()) { hatayiAyarla('Yeni analiz akışı için backend bağlantısı henüz etkinleştirilmedi. Fotoğrafların yüklenmedi.'); return; }
    kilit.current = true; beklemeyiAyarla(true); hatayiAyarla(null);
    try {
      if (!deneme.current) {
        const id = randomUUID();
        deneme.current = { id, kullaniciId, form: { ...form, fotograflar: [...form.fotograflar] },
          yollar: form.fotograflar.map((_, i) => `${kullaniciId}/${id}/${i}.jpg`), yuklendi: false };
      }
      const ani = await analizIcinAniOlustur(deneme.current, ilerlemeyiAyarla);
      belirsiziAyarla(false); kaydiAyarla(ani.id);
    } catch (sorun) {
      const belirsizSonuc = sorun instanceof YeniAniHatasi && sorun.belirsiz;
      if (!belirsizSonuc) deneme.current = null;
      belirsiziAyarla(belirsizSonuc);
      hatayiAyarla(sorun instanceof Error ? sorun.message : 'Kayıt tamamlanamadı. Tekrar dene.');
    } finally { kilit.current = false; beklemeyiAyarla(false); ilerlemeyiAyarla(''); }
  }
  return <Sayfa alt={<AltGezinme etkin="/yeni-ani" />}>
    <Text accessibilityRole="header" style={ORTAK.baslik}>Yeni Anı Ekle</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {form.fotograflar.map((foto, i) => <View key={`${foto.uri}-${i}`} style={{ width: '30%', aspectRatio: 1, flexGrow: 1, maxWidth: '32%' }}>
        <Image source={{ uri: foto.uri }} accessibilityLabel={`Seçilen fotoğraf ${i + 1}`} style={{ width: '100%', height: '100%', borderRadius: 20 }} />
        <Text style={{ position: 'absolute', bottom: 8, left: 8, color: RENKLER.yuzey, backgroundColor: RENKLER.ana, borderRadius: 10, padding: 4 }}>✓ {i + 1}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`Fotoğraf ${i + 1} kaldır`} disabled={kilitli}
          onPress={() => ayarla((eski) => ({ ...eski, fotograflar: eski.fotograflar.filter((_, sira) => sira !== i) }))}
          style={{ position: 'absolute', right: 0, top: 0, padding: 12, backgroundColor: RENKLER.yuzey, borderRadius: 18 }}>
          <Text style={{ color: RENKLER.tehlike }}>×</Text>
        </Pressable>
      </View>)}
      {form.fotograflar.length < 5 && <Pressable accessibilityRole="button" accessibilityLabel="Fotoğraf Ekle" disabled={kilitli}
        onPress={() => void sec()} style={{ width: '30%', minHeight: 110, justifyContent: 'center', alignItems: 'center', gap: 8,
          borderRadius: 20, borderWidth: 1, borderStyle: 'dashed', borderColor: RENKLER.ana, backgroundColor: RENKLER.yumusak }}>
        <Text style={{ color: RENKLER.ana, fontSize: 28 }}>+</Text><Text style={ORTAK.metin}>Fotoğraf Ekle</Text>
      </Pressable>}
    </View>
    <Text style={ORTAK.metin}>{form.fotograflar.length}/5 fotoğraf</Text>
    <Text style={ORTAK.etiket}>Başlık *</Text>
    <TextInput accessibilityLabel="Anı başlığı" value={form.baslik} editable={!kilitli} maxLength={200} onChangeText={(baslik) => ayarla((eski) => ({ ...eski, baslik }))} style={ORTAK.girdi} />
    <Text style={ORTAK.etiket}>Açıklama</Text>
    <TextInput accessibilityLabel="Anı açıklaması" value={form.aciklama} editable={!kilitli} multiline maxLength={5000}
      onChangeText={(aciklama) => ayarla((eski) => ({ ...eski, aciklama }))} style={[ORTAK.girdi, { minHeight: 110, textAlignVertical: 'top' }]} />
    <Text style={ORTAK.etiket}>Tarih *</Text>
    <AniTarihi deger={form.tarih} enGec={yerelTarih(new Date())} devreDisi={kilitli} degistir={(tarih) => ayarla((eski) => ({ ...eski, tarih }))} />
    {!memoryApiEtkin() && <Text style={ORTAK.metin}>Analiz API bağlantısı henüz yapılandırılmadı. Bağlantı etkinleştirilene kadar fotoğrafların yüklenmez ve kayıt oluşturulmaz.</Text>}
    {hata && <Text accessibilityRole="alert" style={ORTAK.hata}>{hata}</Text>}
    {!!ilerleme && <Text accessibilityLiveRegion="polite" style={ORTAK.metin}>{ilerleme}</Text>}
    <Dugme baslik={belirsiz ? 'Aynı kaydı tekrar dene' : 'Ana Küre ile Analiz Et'} bekliyor={bekliyor} tiklaninca={() => void analizeGit()} />
  </Sayfa>;
}
