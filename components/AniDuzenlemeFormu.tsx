import { useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { usePreventRemove } from 'expo-router/react-navigation';
import { AniTarihi } from './AniTarihi';
import { Dugme } from './Dugme';
import { RENKLER, ORTAK } from '../constants/tema';
import { galeriBilgileriniGuncelle } from '../services/galleryDetailService';
import type { AniDetayi, AniDuzenleme, AniGuncellenen } from '../types/ani';
import { yeniAniTarihiniDogrula, yerelTarih } from '../lib/aniDogrulama';

export function AniDuzenlemeFormu({ ani, kullaniciId, tamamlandi, vazgec }:
  { ani: AniDetayi; kullaniciId: string; tamamlandi: (ani: AniGuncellenen) => void; vazgec: () => void }) {
  const [form, ayarla] = useState<AniDuzenleme>({ baslik: ani.title, aciklama: ani.description ?? '', tarih: ani.memory_date, kureId: ani.sphere_id ?? '' });
  const [bekliyor, beklemeyiAyarla] = useState(false);
  const [hata, hatayiAyarla] = useState<string | null>(null);
  const istek = useRef(false);
  usePreventRemove(bekliyor, () => Alert.alert('Güncelleme sürüyor', 'İşlem tamamlanana kadar bu ekranda kal.'));
  async function kaydet() {
    if (istek.current) return;
    const tarihHatasi = yeniAniTarihiniDogrula(form.tarih);
    if (tarihHatasi) { hatayiAyarla(tarihHatasi); return; }
    istek.current = true; beklemeyiAyarla(true); hatayiAyarla(null);
    try {
      const sonuc = await galeriBilgileriniGuncelle(kullaniciId, ani.id, form, ani.version);
      tamamlandi(sonuc);
    } catch (sorun) { hatayiAyarla(sorun instanceof Error ? sorun.message : 'Güncelleme başarısız. Tekrar dene.'); }
    finally { istek.current = false; beklemeyiAyarla(false); }
  }
  return <View style={stiller.form}>
    <Text style={stiller.etiket}>Başlık *</Text>
    <TextInput accessibilityLabel="Anı başlığını düzenle" style={stiller.girdi} value={form.baslik} maxLength={200} editable={!bekliyor}
      onChangeText={(baslik) => ayarla((f) => ({ ...f, baslik }))} />
    <Text style={stiller.etiket}>Açıklama</Text>
    <TextInput accessibilityLabel="Anı açıklamasını düzenle" style={[stiller.girdi, { minHeight: 100, textAlignVertical: 'top' }]}
      value={form.aciklama} maxLength={5000} multiline editable={!bekliyor}
      onChangeText={(aciklama) => ayarla((f) => ({ ...f, aciklama }))} />
    <Text style={stiller.etiket}>Anı tarihi *</Text>
    <AniTarihi deger={form.tarih} enGec={yerelTarih(new Date())} degistir={(tarih) => ayarla((f) => ({ ...f, tarih }))} devreDisi={bekliyor} />
    {hata && <Text accessibilityRole="alert" style={stiller.hata}>{hata}</Text>}
    <Dugme baslik="Değişiklikleri kaydet" bekliyor={bekliyor} tiklaninca={() => void kaydet()} />
    <Dugme baslik="Vazgeç" ikincil devreDisi={bekliyor} tiklaninca={vazgec} />
  </View>;
}
const stiller = StyleSheet.create({
  form: { gap: 14 },
  etiket: { color: RENKLER.yazi, fontWeight: '600' },
  girdi: ORTAK.girdi,
  hata: ORTAK.hata,
});
