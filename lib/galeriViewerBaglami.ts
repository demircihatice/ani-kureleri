import { randomUUID } from 'expo-crypto';
import type { DuyguFiltresi } from '../constants/duyguSunumu';
import type { GaleriSayfasi } from '../types/galeri';

interface GaleriBaglami { kimlik: string; kullaniciId: string; filtre: DuyguFiltresi; sayfa: GaleriSayfasi }
let sonBaglam: GaleriBaglami | null = null;
// Yalnızca açık galerinin yüklenmiş metadata'sı. URL'ler route'a veya diske yazılmaz.
export function galeriBaglaminiHazirla(kullaniciId: string, filtre: DuyguFiltresi, sayfa: GaleriSayfasi) {
  const anilar = sayfa.anilar.filter(f => f.fotografYolu?.startsWith(`${kullaniciId}/${f.id}/`) && !f.fotografYolu.includes('..') &&
    (filtre === 'tumu' || f.duygu === filtre));
  sonBaglam = { kimlik: randomUUID(), kullaniciId, filtre, sayfa: { ...sayfa, anilar } };
  return sonBaglam.kimlik;
}
export function galeriBaglaminiAl(kullaniciId: string, kimlik: string) {
  return sonBaglam?.kimlik === kimlik && sonBaglam.kullaniciId === kullaniciId ? sonBaglam : null;
}
