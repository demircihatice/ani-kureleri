import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, processLock } from '@supabase/supabase-js';

// Expo bu değişkenleri derleme sırasında yerleştirir; doğrudan erişim gereklidir.
const adres = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const yayinlanabilirAnahtar = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

function adresGecerliMi(deger: string | undefined): deger is string {
  if (!deger) return false;
  try {
    const url = new URL(deger);
    return url.protocol === 'https:' ||
      (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname));
  } catch {
    return false;
  }
}

// Eksik yapılandırmada sahte bir sunucuya istek göndermek yerine istemci oluşturulmaz.
// Yalnızca publishable anahtar kabul edilir; service_role/secret anahtar kullanılmaz.
export const supabase = adresGecerliMi(adres) && yayinlanabilirAnahtar?.startsWith('sb_publishable_')
  ? createClient(adres, yayinlanabilirAnahtar, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        lock: processLock,
      },
    })
  : null;

export function supabaseIstemcisiniAl() {
  if (!supabase) {
    throw new Error('Supabase yapılandırması eksik veya geçersiz. .env dosyasını kontrol edin.');
  }
  return supabase;
}
