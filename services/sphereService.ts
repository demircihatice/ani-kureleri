import { supabaseIstemcisiniAl } from '../lib/supabase';
import type { KureSetiOzeti, KureSetiSatiri } from '../types/kure';

export async function kureSetiniGetir(kullaniciId: string, sinyal: AbortSignal): Promise<KureSetiOzeti | null> {
  if (!kullaniciId) throw new Error('Küreleri görmek için giriş yapın.');
  // Kimlik filtresi sorguyu daraltır; güvenlik sınırı sunucudaki RLS politikalarıdır.
  // count, fotoğraf/açıklama veya bütün anı satırlarını indirmeden hesaplanır.
  const { data, error } = await supabaseIstemcisiniAl()
    .from('sphere_sets')
    .select('id, name, spheres(id, name, emotion_type, memories(count))')
    .eq('user_id', kullaniciId)
    .abortSignal(sinyal)
    .returns<KureSetiSatiri[]>()
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const sira = { mutluluk: 0, huzun: 1, nostalji: 2 };
  return {
    id: data.id,
    name: data.name,
    kureler: data.spheres.map((kure) => ({
      id: kure.id, name: kure.name, emotion_type: kure.emotion_type,
      aniSayisi: kure.memories[0]?.count ?? 0,
    })).sort((a, b) => sira[a.emotion_type] - sira[b.emotion_type]),
  };
}
