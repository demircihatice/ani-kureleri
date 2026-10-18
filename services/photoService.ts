import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import { EN_FAZLA_FOTOGRAF, EN_FAZLA_FOTOGRAF_BOYUTU } from '../constants/ani';
import type { SecilenFotograf } from '../types/ani';

export async function galeridenSec(kalan = EN_FAZLA_FOTOGRAF): Promise<SecilenFotograf[] | null> {
  if (!Number.isInteger(kalan) || kalan < 1 || kalan > EN_FAZLA_FOTOGRAF) throw new Error('Fotoğraf sınırı geçersiz.');
  // Sistem fotoğraf seçicisi yalnızca kullanıcının seçtiği fotoğrafları açar.
  const sonuc = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'], allowsMultipleSelection: true,
    selectionLimit: kalan, allowsEditing: false, quality: 1,
  });
  if (sonuc.canceled) return null;
  if (sonuc.assets.length > kalan) throw new Error(`En fazla ${kalan} fotoğraf daha seçebilirsin.`);
  return sonuc.assets.map(({ uri, width, height }) => ({ uri, width, height }));
}

export async function fotografiHazirla(fotograf: SecilenFotograf, enBuyukKenar = 1600): Promise<ArrayBuffer> {
  const baglam = ImageManipulator.manipulate(fotograf.uri);
  try {
    if (Math.max(fotograf.width, fotograf.height) > enBuyukKenar) {
      baglam.resize(fotograf.width >= fotograf.height ? { width: enBuyukKenar } : { height: enBuyukKenar });
    }
    const resim = await baglam.renderAsync();
    try {
      const sonuc = await resim.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
      const dosya = Platform.OS === 'web' ? null : new File(sonuc.uri);
      try {
        const veri = dosya ? await dosya.arrayBuffer() : await (await fetch(sonuc.uri)).arrayBuffer();
        if (!veri.byteLength || veri.byteLength > EN_FAZLA_FOTOGRAF_BOYUTU) {
          throw new Error('Hazırlanan fotoğraf 6 MB sınırını aşıyor. Daha küçük bir fotoğraf seç.');
        }
        return veri;
      } finally {
        // Yalnızca hazırladığımız geçici JPEG; galerideki asıl fotoğraf korunur.
        try { if (dosya?.exists) dosya.delete(); }
        catch { /* Önbellek temizliği hatası hazırlanmış fotoğrafın yüklenmesini engellemez. */ }
      }
    } finally { resim.release(); }
  } finally {
    // renderAsync/resize başarısız olsa da native bağlam serbest bırakılır.
    baglam.release();
  }
}
