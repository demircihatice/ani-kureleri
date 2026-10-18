import { useRef, useState } from 'react';
import { Link } from 'expo-router';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { RENKLER, ORTAK } from '../constants/tema';
import { authHataMesaji, girisBilgileriniDogrula, kayitBilgileriniDogrula } from '../lib/authDogrulama';
import { girisYap, kayitOl } from '../services/authService';
import { Dugme } from './Dugme';
import { Sayfa } from './Sayfa';
import { AnaKure } from './ui/AnaKure';
import { SifreAlani } from './SifreAlani';

export function AuthFormu({ kayit = false }: { kayit?: boolean }) {
  const [adSoyad, adSoyadAyarla] = useState('');
  const [eposta, epostaAyarla] = useState('');
  const [sifre, sifreAyarla] = useState('');
  const [sifreTekrar, sifreTekrarAyarla] = useState('');
  const [bekliyor, bekliyorAyarla] = useState(false);
  const [hata, hataAyarla] = useState<string | null>(null);
  const [dogrulama, dogrulamaAyarla] = useState(false);
  const istekSuruyor = useRef(false);

  async function gonder() {
    if (istekSuruyor.current) return;
    const bilgiler = { adSoyad, eposta, sifre };
    const sorun = kayit ? kayitBilgileriniDogrula(bilgiler) : girisBilgileriniDogrula(bilgiler);
    hataAyarla(sorun);
    if (sorun) return;
    if (kayit && sifre !== sifreTekrar) { hataAyarla('Şifreler eşleşmiyor.'); return; }
    istekSuruyor.current = true;
    bekliyorAyarla(true);
    try {
      if (kayit) {
        const sonuc = await kayitOl(bilgiler);
        dogrulamaAyarla(sonuc.dogrulamaGerekli);
      } else {
        await girisYap(bilgiler);
      }
      sifreAyarla('');
      sifreTekrarAyarla('');
      // Yönlendirmeyi tek oturum dinleyicisi ve korumalı rotalar yönetir.
    } catch (sorun) {
      hataAyarla(authHataMesaji(sorun));
    } finally {
      istekSuruyor.current = false;
      bekliyorAyarla(false);
    }
  }

  if (dogrulama) return (
    <Sayfa>
      <Text accessibilityRole="header" style={stiller.baslik}>E-postanı kontrol et</Text>
      <Text style={stiller.aciklama}>
        Kayıt uygunsa {eposta.trim()} adresine bir doğrulama bağlantısı gönderildi.
        Bağlantıyı açtıktan sonra uygulamaya dönerek giriş yapabilirsin.
      </Text>
      <Text style={stiller.aciklama}>Zaten hesabın varsa mevcut şifrenle giriş yap. E-posta gelmezse spam klasörünü kontrol et.</Text>
      <Link href="/giris" replace style={stiller.baglanti}>Giriş ekranına dön</Link>
    </Sayfa>
  );

  return (
    <Sayfa ortala>
      <AnaKure />
      <Text style={stiller.marka}>Anı Küresi</Text>
      <Text accessibilityRole="header" style={stiller.baslik}>{kayit ? 'Hesap Oluştur' : 'Hoş geldin'}</Text>
      <View style={stiller.form}>
        {kayit && <View style={stiller.alan}>
          <Text style={stiller.etiket}>Ad soyad</Text>
          <TextInput accessibilityLabel="Ad soyad" style={stiller.girdi} value={adSoyad} onChangeText={adSoyadAyarla}
            editable={!bekliyor} autoComplete="name" textContentType="name" maxLength={100} autoCapitalize="words" />
        </View>}
        <View style={stiller.alan}>
          <Text style={stiller.etiket}>E-posta</Text>
          <TextInput accessibilityLabel="E-posta" style={stiller.girdi} value={eposta} onChangeText={epostaAyarla}
            editable={!bekliyor} autoComplete="email" textContentType="emailAddress" keyboardType="email-address"
            autoCapitalize="none" autoCorrect={false} maxLength={254} />
        </View>
        <View style={stiller.alan}>
          <Text style={stiller.etiket}>Şifre</Text>
          <SifreAlani accessibilityLabel="Şifre" value={sifre} onChangeText={sifreAyarla}
            placeholder={kayit ? 'En az 8 karakter' : undefined} placeholderTextColor="#999999"
            editable={!bekliyor} secureTextEntry autoComplete={kayit ? 'new-password' : 'current-password'}
            textContentType={kayit ? 'newPassword' : 'password'} autoCapitalize="none" autoCorrect={false}
            returnKeyType={kayit ? 'next' : 'go'} onSubmitEditing={kayit ? undefined : () => void gonder()} />
        </View>
        {kayit && <View style={stiller.alan}>
          <Text style={stiller.etiket}>Şifre Tekrar</Text>
          <SifreAlani accessibilityLabel="Şifre Tekrar" value={sifreTekrar} onChangeText={sifreTekrarAyarla}
            style={stiller.girdi} editable={!bekliyor} secureTextEntry autoComplete="new-password"
            textContentType="newPassword" autoCapitalize="none" autoCorrect={false}
            onSubmitEditing={() => void gonder()} returnKeyType="go" />
        </View>}
        {hata && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={stiller.hata}>{hata}</Text>}
        <Dugme baslik={kayit ? 'Kayıt Ol' : 'Giriş Yap'} bekliyor={bekliyor} tiklaninca={() => void gonder()} />
      </View>
      {!bekliyor && <View style={stiller.altBaglantilar}>
        <View style={stiller.hesapSatiri}>
          <Text style={stiller.hesapSorusu}>{kayit ? 'Zaten hesabın var mı?' : 'Hesabın yok mu?'}</Text>
          <Link href={kayit ? '/giris' : '/kayit'} replace style={stiller.baglanti}>
            {kayit ? 'Giriş Yap' : 'Kayıt Ol'}
          </Link>
        </View>
        <Link href="/" replace style={stiller.geriBaglantisi} accessibilityLabel="Başlangıca dön">‹  Başlangıca dön</Link>
      </View>}
    </Sayfa>
  );
}

const stiller = StyleSheet.create({
  marka: { color: RENKLER.anaKoyu, fontSize: 30, fontWeight: '700', textAlign: 'center' },
  baslik: { color: RENKLER.yazi, fontSize: 22, fontWeight: '600' },
  aciklama: { color: RENKLER.ikincil, fontSize: 16, lineHeight: 25 },
  form: { backgroundColor: RENKLER.yuzey, borderWidth: 1, borderColor: RENKLER.kenar, padding: 20, borderRadius: 20, gap: 18 },
  alan: { gap: 8 },
  etiket: { color: RENKLER.yazi, fontWeight: '600', fontSize: 14 },
  girdi: ORTAK.girdi,
  hata: { color: RENKLER.tehlike, fontSize: 14, lineHeight: 22 },
  altBaglantilar: { alignItems: 'center', gap: 8 },
  hesapSatiri: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', columnGap: 4 },
  hesapSorusu: { color: RENKLER.ikincil, fontSize: 14 },
  baglanti: { color: RENKLER.anaKoyu, minHeight: 44, paddingVertical: 12, paddingHorizontal: 6, textAlign: 'center', fontSize: 15, fontWeight: '600' },
  geriBaglantisi: { color: RENKLER.ikincil, backgroundColor: RENKLER.yumusak, borderRadius: 18, overflow: 'hidden',
    minHeight: 44, paddingVertical: 12, paddingHorizontal: 18, textAlign: 'center', fontSize: 14 },
});
