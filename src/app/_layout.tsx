import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ActivityIndicator, Text } from 'react-native';
import { OturumSaglayici, useOturum } from '../../hooks/useOturum';
import { Sayfa } from '../../components/Sayfa';
import { Dugme } from '../../components/Dugme';
import { RENKLER } from '../../constants/tema';

function Ekranlar() {
  const { oturum, yukleniyor, hata, tekrarDene } = useOturum();
  if (yukleniyor || hata) return (
    <Sayfa>
      <Text style={{ color: RENKLER.yazi, textAlign: 'center', fontSize: 32, fontWeight: '700' }}>Anı Küresi</Text>
      {yukleniyor ? <>
        <ActivityIndicator color={RENKLER.yazi} size="large" />
        <Text style={{ textAlign: 'center', color: RENKLER.ikincil }}>Oturum kontrol ediliyor…</Text>
      </> : <>
        <Text accessibilityRole="alert" style={{ color: RENKLER.ikincil }}>{hata}</Text>
        <Dugme baslik="Tekrar dene" tiklaninca={tekrarDene} />
      </>}
    </Sayfa>
  );
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!oturum}>
        <Stack.Screen name="index" />
        <Stack.Screen name="giris" />
        <Stack.Screen name="kayit" />
      </Stack.Protected>
      <Stack.Protected guard={!!oturum}>
        <Stack.Screen name="galeri" />
        <Stack.Screen name="yeni-ani" />
        <Stack.Screen name="ana-sayfa" />
        <Stack.Screen name="analiz" />
        <Stack.Screen name="analiz-sonucu" />
        <Stack.Screen name="duygu-duzenle" />
        <Stack.Screen name="kure/[id]" />
        <Stack.Screen name="ani/[id]" />
        <Stack.Screen name="fotograf/[id]" />
        <Stack.Screen name="profil" />
      </Stack.Protected>
    </Stack>
  );
}

export default function UygulamaDuzeni() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <OturumSaglayici><Ekranlar /></OturumSaglayici>
    </SafeAreaProvider>
  );
}
