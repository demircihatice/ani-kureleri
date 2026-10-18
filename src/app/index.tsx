import { Text } from 'react-native';
import { router } from 'expo-router';
import { Sayfa } from '../../components/Sayfa';
import { Dugme } from '../../components/Dugme';
import { AnaKure } from '../../components/ui/AnaKure';
import { ORTAK } from '../../constants/tema';
export default function BaslangicEkrani() {
  return <Sayfa ortala>
    <AnaKure buyuk />
    <Text accessibilityRole="header" style={[ORTAK.baslik, { fontSize: 38, textAlign: 'center' }]}>Anı Küresi</Text>
    <Dugme baslik="Giriş Yap" tiklaninca={() => router.push('/giris')} />
    <Dugme baslik="Kayıt Ol" ikincil tiklaninca={() => router.push('/kayit')} />
  </Sayfa>;
}
