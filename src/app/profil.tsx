import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { Sayfa } from '../../components/Sayfa';
import { Dugme } from '../../components/Dugme';
import { AltGezinme } from '../../components/ui/AltGezinme';
import { ORTAK, RENKLER } from '../../constants/tema';
import { ProfilFotografi } from '../../components/ProfilFotografi';
import { useOturum } from '../../hooks/useOturum';
import { useGaleri } from '../../hooks/useGaleri';
import { cikisYap } from '../../services/authService';
import { authHataMesaji } from '../../lib/authDogrulama';
export default function ProfilEkrani() {
  const { oturum } = useOturum();
  const { veri, hata: veriHatasi, yenile, yukleniyor } = useGaleri(oturum?.user.id ?? '', 'tumu', true);
  const [avatarBekliyor, avatarBeklemeyiAyarla] = useState(false);
  const [bekliyor, bekliyorAyarla] = useState(false);
  const [hata, hataAyarla] = useState<string | null>(null);
  const istekSuruyor = useRef(false);
  const metadataAdi = oturum?.user.user_metadata.full_name;
  const ad = typeof metadataAdi === 'string' && metadataAdi.trim() ? metadataAdi : 'Ad belirtilmedi';
  async function cik() {
    if (istekSuruyor.current) return;
    istekSuruyor.current = true; bekliyorAyarla(true); hataAyarla(null);
    try { await cikisYap(); }
    catch (sorun) { hataAyarla(authHataMesaji(sorun)); }
    finally { istekSuruyor.current = false; bekliyorAyarla(false); }
  }
  return <Sayfa alt={<AltGezinme etkin="/profil" />}>
    <Text accessibilityRole="header" style={ORTAK.baslik}>Profil</Text>
    <View style={{ alignItems: 'center', gap: 10, paddingVertical: 20 }}>
      <ProfilFotografi key={oturum?.user.id} kullaniciId={oturum?.user.id ?? ''}
        yol={oturum?.user.user_metadata.avatar_path} ad={ad} beklemeDegisti={avatarBeklemeyiAyarla} />
      <Text style={[ORTAK.baslik, { fontSize: 23 }]}>{ad}</Text><Text style={ORTAK.metin}>{oturum?.user.email}</Text>
    </View>
    <View style={{ flexDirection: 'row', gap: 8 }}>{[
      { ad: 'Toplam Anı', deger: veri?.toplam ?? '—' }, { ad: 'Bu Ay', deger: veri?.buAy ?? '—' },
    ].map((bilgi) => <View key={bilgi.ad} style={[ORTAK.kart, { flex: 1, padding: 12, alignItems: 'center' }]}>
      <Text style={[ORTAK.baslik, { fontSize: 25 }]}>{bilgi.deger}</Text><Text style={[ORTAK.metin, { fontSize: 11, textAlign: 'center' }]}>{bilgi.ad}</Text>
    </View>)}</View>
    {veriHatasi && <><Text accessibilityRole="alert" style={ORTAK.hata}>{veriHatasi}</Text><Dugme baslik="Özeti yenile" ikincil bekliyor={yukleniyor} tiklaninca={yenile} /></>}
    <View style={ORTAK.kart}>{['Profil Bilgileri', 'Gizlilik', 'Bildirimler', 'Ana Küre Bağlantısı', 'Yardım'].map((menu, sira, menuler) =>
      <View key={menu} accessibilityLabel={`${menu}, yakında`} style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', paddingVertical: 10, borderBottomWidth: sira < menuler.length - 1 ? 1 : 0, borderColor: RENKLER.kenar }}>
        <Text style={ORTAK.etiket}>{menu}</Text><Text style={ORTAK.metin}>Yakında</Text>
      </View>)}</View>
    {hata && <Text accessibilityRole="alert" style={ORTAK.hata}>{hata}</Text>}
    <Dugme baslik="Çıkış Yap" bekliyor={bekliyor} devreDisi={avatarBekliyor} tiklaninca={() => void cik()} />
  </Sayfa>;
}
