import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import { EN_FAZLA_FOTOGRAF, EN_FAZLA_FOTOGRAF_BOYUTU } from '../constants/ani';
import type { SecilenFotograf } from '../types/ani';

export async function galeridenSec(): Promise<SecilenFotograf[] | null> {
  // Sistem fotoğraf seçicisi yalnızca kullanıcının seçtiği fotoğrafları açar.
  const sonuc = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'], allowsMultipleSelection: true,
    selectionLimit: EN_FAZLA_FOTOGRAF, allowsEditing: false, quality: 1,
  });
  if (sonuc.canceled) return null;
  if (sonuc.assets.length > EN_FAZLA_FOTOGRAF) throw new Error('En fazla 5 fotoğraf seçebilirsin.');
  return sonuc.assets.map(({ uri, width, height }) => ({ uri, width, height }));
}

export async function fotografiHazirla(fotograf: SecilenFotograf): Promise<ArrayBuffer> {
  const baglam = ImageManipulator.manipulate(fotograf.uri);
  try {
    if (Math.max(fotograf.width, fotograf.height) > 1600) {
      baglam.resize(fotograf.width >= fotograf.height ? { width: 1600 } : { height: 1600 });
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
