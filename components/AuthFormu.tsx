import { useRef, useState } from 'react';
import { Link } from 'expo-router';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { RENKLER } from '../constants/tema';
import { authHataMesaji, girisBilgileriniDogrula, kayitBilgileriniDogrula } from '../lib/authDogrulama';
import { girisYap, kayitOl } from '../services/authService';
import { Dugme } from './Dugme';
import { Sayfa } from './Sayfa';

export function AuthFormu({ kayit = false }: { kayit?: boolean }) {
  const [adSoyad, adSoyadAyarla] = useState('');
  const [eposta, epostaAyarla] = useState('');
  const [sifre, sifreAyarla] = useState('');
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
    <Sayfa>
      <Text style={stiller.marka}>Anı Küreleri</Text>
      <Text accessibilityRole="header" style={stiller.baslik}>{kayit ? 'Anılarına bir yer aç' : 'Yeniden hoş geldin'}</Text>
      <Text style={stiller.aciklama}>{kayit ? 'Hesabını oluştur, hikâyene başla.' : 'Anılarına ulaşmak için giriş yap.'}</Text>
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
          <TextInput accessibilityLabel="Şifre" style={stiller.girdi} value={sifre} onChangeText={sifreAyarla}
            editable={!bekliyor} secureTextEntry autoComplete={kayit ? 'new-password' : 'current-password'}
            textContentType={kayit ? 'newPassword' : 'password'} autoCapitalize="none" autoCorrect={false}
            returnKeyType="go" onSubmitEditing={() => void gonder()} />
          {kayit && <Text style={stiller.ipucu}>En az 8 karakter.</Text>}
        </View>
        {hata && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={stiller.hata}>{hata}</Text>}
        <Dugme baslik={kayit ? 'Kayıt ol' : 'Giriş yap'} bekliyor={bekliyor} tiklaninca={() => void gonder()} />
      </View>
      {!bekliyor && <>
        <Link href={kayit ? '/giris' : '/kayit'} replace style={stiller.baglanti}>
          {kayit ? 'Hesabın var mı? Giriş yap' : 'Hesabın yok mu? Kayıt ol'}
        </Link>
        <Link href="/" replace style={stiller.baglanti}>Başlangıca dön</Link>
      </>}
    </Sayfa>
  );
}

const stiller = StyleSheet.create({
  marka: { color: RENKLER.ikincil, letterSpacing: 1, fontSize: 15 },
  baslik: { color: RENKLER.yazi, fontSize: 30, fontWeight: '700' },
  aciklama: { color: RENKLER.ikincil, fontSize: 16, lineHeight: 25 },
  form: { backgroundColor: '#FFFFFF', padding: 22, borderRadius: 24, gap: 18 },
  alan: { gap: 8 },
  etiket: { color: RENKLER.yazi, fontWeight: '600', fontSize: 14 },
  girdi: { minHeight: 48, borderWidth: 1, borderColor: '#D4CDDD', borderRadius: 12, padding: 12, color: RENKLER.yazi, fontSize: 16, backgroundColor: '#FCFAFD' },
  ipucu: { color: RENKLER.ikincil, fontSize: 12 },
  hata: { color: '#9F303B', fontSize: 14, lineHeight: 22 },
  baglanti: { color: RENKLER.yazi, paddingVertical: 10, textAlign: 'center', fontSize: 15, textDecorationLine: 'underline' },
});
