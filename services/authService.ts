import { supabaseIstemcisiniAl } from '../lib/supabase';
import type { GirisBilgileri, KayitBilgileri } from '../types/auth';

export async function kayitOl({ adSoyad, eposta, sifre }: KayitBilgileri) {
  const { data, error } = await supabaseIstemcisiniAl().auth.signUp({
    email: eposta.trim(),
    password: sifre,
    options: { data: { full_name: adSoyad.trim() } },
  });
  if (error) throw error;
  // Doğrulama açıksa session null'dır. Tekrarlı kayıt da gizlilik amacıyla
  // aynı yanıtı verebilir; bu nedenle ekranda kesin "hesap oluşturuldu" demeyiz.
  return { dogrulamaGerekli: !data.session };
}

export async function girisYap({ eposta, sifre }: GirisBilgileri) {
  const { error } = await supabaseIstemcisiniAl().auth.signInWithPassword({
    email: eposta.trim(), password: sifre,
  });
  if (error) throw error;
}

export async function cikisYap() {
  // Yalnızca bu cihazın oturumunu kapatır; diğer cihazlara dokunmaz.
  const { error } = await supabaseIstemcisiniAl().auth.signOut({ scope: 'local' });
  if (error) throw error;
}

export async function oturumuAl() {
  const { data, error } = await supabaseIstemcisiniAl().auth.getSession();
  if (error) throw error;
  return data.session;
}
