// Publishable key + iki gerçek kullanıcı JWT'si. service_role/admin anahtarı kullanılmaz.
// Her hesapta en az bir fotoğraflı anı olmalı. Sadece bu çalışmanın geçici verileri temizlenir.
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

const url=process.env.EXPO_PUBLIC_SUPABASE_URL;
const key=process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const bucket='ani-fotograflari';
const hesaplar=[];
let sayi=0;
function kontrol(kosul,mesaj) { assert.ok(kosul,mesaj);sayi++; }
function basarili(sonuc,mesaj) { if(sonuc.error)throw new Error(mesaj);return sonuc.data; }
// Ağ hatası erişim reddi sayılmaz; Storage API'nin yetki/gizli nesne yanıtı gerekir.
function storageEngellendi(sonuc) { return !!sonuc.error && [400,403,404].includes(Number(sonuc.error.statusCode)); }
function istemci() { return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(adres,secenek)=>fetch(adres,{...secenek,signal:AbortSignal.timeout(30000)})}}); }
async function gorunmez(client,tablo,id) {
  const sonuc=await client.from(tablo).select('id').eq('id',id);
  kontrol(!sonuc.error && sonuc.data.length===0,`${tablo}: yabancı UUID okunabildi veya sorgu doğrulanamadı`);
}
async function reddedilen(sonuc,mesaj) { kontrol(sonuc.error?.code==='42501',mesaj); }
async function calistir() {
  if(!url || !key || !['TEST_A_EMAIL','TEST_A_PASSWORD','TEST_B_EMAIL','TEST_B_PASSWORD'].every((k)=>process.env[k]))
    throw new Error('Önce .env.guvenlik.local dosyasına iki doğrulanmış test hesabını gir. Şifreleri sohbet veya komut satırına yazma.');
  if(!key.startsWith('sb_publishable_'))throw new Error('Bu araç yalnızca uygulamanın Publishable key değerini kullanır.');
  for(const ad of ['A','B']) {
    const client=istemci();
    const giris=basarili(await client.auth.signInWithPassword({email:process.env[`TEST_${ad}_EMAIL`],password:process.env[`TEST_${ad}_PASSWORD`]}),`${ad}: test hesabıyla giriş başarısız`);
    hesaplar.push({ad,client,user:giris.user.id,yollar:[],memory:null});
  }
  kontrol(hesaplar[0].user!==hesaplar[1].user,'İki farklı kullanıcı hesabı gerekli');
  for(const h of hesaplar) {
    const {client,user}=h;
    h.profiles=basarili(await client.from('profiles').select('id,full_name'),'Profil okunamadı');
    h.sets=basarili(await client.from('sphere_sets').select('id,user_id,name'),'Setler okunamadı');
    h.spheres=basarili(await client.from('spheres').select('id,sphere_set_id'),'Küreler okunamadı');
    h.memories=basarili(await client.from('memories').select('id,user_id,sphere_id,image_url'),'Anılar okunamadı');
    h.images=basarili(await client.from('memory_images').select('id,memory_id,storage_path'),'Fotoğraf satırları okunamadı');
    kontrol(h.profiles.length===1 && h.profiles[0].id===user,'Profil izolasyonu');
    kontrol(h.sets.length===1 && h.sets[0].user_id===user,'Set izolasyonu');
    kontrol(h.spheres.length===3 && h.spheres.every((s)=>s.sphere_set_id===h.sets[0].id),'Küre izolasyonu');
    kontrol(h.memories.every((m)=>m.user_id===user && h.spheres.some((s)=>s.id===m.sphere_id)),'Anı izolasyonu');
    kontrol(h.images.every((f)=>h.memories.some((m)=>m.id===f.memory_id) && f.storage_path.startsWith(user+'/')),'Fotoğraf satırı izolasyonu');
    const kaynak=h.images[0]?.storage_path ?? h.memories[0]?.image_url;
    if(!kaynak)throw new Error(`${h.ad}: önce Expo Go'da bir fotoğraflı test anısı oluştur`);
    const dosya=basarili(await client.storage.from(bucket).download(kaynak),`${h.ad}: kendi fotoğrafı indirilemedi`);
    h.bytes=await dosya.arrayBuffer();h.memory=randomUUID();
    h.path=`${user}/${h.memory}/0.jpg`;
    basarili(await client.storage.from(bucket).upload(h.path,h.bytes,{contentType:'image/jpeg',upsert:false}),`${h.ad}: kendi test dosyası yüklenemedi`);h.yollar.push(h.path);
    basarili(await client.rpc('ani_olustur',{p_id:h.memory,p_sphere_id:h.spheres[0].id,p_title:'Aşama 9 geçici güvenlik testi',p_description:null,p_memory_date:'2024-01-01',p_paths:[h.path]}),`${h.ad}: geçici test anısı oluşturulamadı`);
    h.image=basarili(await client.from('memory_images').select('id').eq('memory_id',h.memory).single(),'Geçici fotoğraf satırı okunamadı').id;
    h.bosPath=`${user}/${randomUUID()}/0.jpg`;
    basarili(await client.storage.from(bucket).upload(h.bosPath,h.bytes,{contentType:'image/jpeg',upsert:false}),'Bağsız test dosyası yüklenemedi');h.yollar.push(h.bosPath);
  }
  for(const [h,d] of [[hesaplar[0],hesaplar[1]],[hesaplar[1],hesaplar[0]]]) {
    const c=h.client;
    for(const [tablo,id] of [['profiles',d.user],['sphere_sets',d.sets[0].id],['spheres',d.spheres[0].id],['memories',d.memory],['memory_images',d.image]])
      await gorunmez(c,tablo,id);
    for(const [tablo,id,veri] of [['profiles',d.user,{full_name:d.profiles[0].full_name}],['sphere_sets',d.sets[0].id,{name:d.sets[0].name}],['spheres',d.spheres[0].id,{sphere_set_id:d.sets[0].id}],['memories',d.memory,{title:'Aşama 9 geçici güvenlik testi'}],['memory_images',d.image,{sort_order:0}]]) {
      const sonuc=await c.from(tablo).update(veri).eq('id',id).select('id');
      kontrol(!sonuc.error && sonuc.data.length===0,`${tablo}: yabancı UPDATE sınırı doğrulanamadı`);
    }
    // DELETE yalnızca aracın oluşturduğu geçici anı/fotoğraf satırlarını hedefler.
    for(const [tablo,id] of [['memory_images',d.image],['memories',d.memory]]) {
      const sonuc=await c.from(tablo).delete().eq('id',id).select('id');
      kontrol(!sonuc.error && sonuc.data.length===0,`${tablo}: yabancı DELETE sınırı doğrulanamadı`);
    }
    await reddedilen(await c.from('profiles').insert({id:d.user,full_name:'İzinsiz'}),'Yabancı profile INSERT engellenmedi');
    await reddedilen(await c.from('sphere_sets').insert({user_id:d.user,name:'İzinsiz'}),'Yabancı kullanıcıya set INSERT engellenmedi');
    await reddedilen(await c.from('spheres').insert({sphere_set_id:d.sets[0].id,name:'İzinsiz',emotion_type:'mutluluk'}),'Yabancı sete küre INSERT engellenmedi');
    const izinsizId=randomUUID();
    const izinsiz=await c.from('memories').insert({id:izinsizId,user_id:h.user,sphere_id:d.spheres[0].id,title:'Aşama 9 geçici güvenlik testi',image_url:h.path,memory_date:'2024-01-01'});
    if(!izinsiz.error)console.error(`Beklenmeyen test kaydı oluştu; panelden kontrol et: ${izinsizId}`);
    await reddedilen(izinsiz,'Yabancı küreye anı INSERT engellenmedi');
    await reddedilen(await c.from('memory_images').insert({memory_id:d.memory,storage_path:`${h.user}/${d.memory}/4.jpg`,sort_order:4}),'Yabancı anıya fotoğraf INSERT engellenmedi');
    const tasima=await c.from('memories').update({sphere_id:d.spheres[0].id}).eq('id',h.memory).select('id');
    // Politika hatalıysa bile yalnızca geçici anı etkilenir; finally sahibiyle temizler.
    await reddedilen(tasima,'Anı yabancı kullanıcının küresine taşınabildi');
    kontrol(storageEngellendi(await c.storage.from(bucket).download(d.path)),'Yabancı Storage download reddi doğrulanamadı');
    kontrol(storageEngellendi(await c.storage.from(bucket).createSignedUrl(d.path,60)),'Yabancı Storage imzalama reddi doğrulanamadı');
    const liste=await c.storage.from(bucket).list(d.user+'/'+d.memory);
    kontrol(!liste.error && liste.data.length===0,'Yabancı Storage klasörü listelenebildi');
    const yasak=`${d.user}/${randomUUID()}/0.jpg`;
    const yukleme=await c.storage.from(bucket).upload(yasak,h.bytes,{contentType:'image/jpeg',upsert:false});
    if(!yukleme.error)d.yollar.push(yasak);
    kontrol(storageEngellendi(yukleme),'Yabancı klasöre Storage upload reddi doğrulanamadı');
    const sil=await c.storage.from(bucket).remove([d.bosPath]);
    kontrol(storageEngellendi(sil) || (!sil.error && sil.data.length===0),'Yabancı bağsız Storage dosyası silme sınırı doğrulanamadı');
    kontrol(!(await d.client.storage.from(bucket).download(d.bosPath)).error,'Yabancı silme sonrası dosya korunmadı');
    kontrol(!(await d.client.from('memories').select('id').eq('id',d.memory).single()).error,'Yabancı saldırı sonrası anı korunmadı');
  }
  const anon=istemci();
  for(const tablo of ['profiles','sphere_sets','spheres','memories','memory_images']) {
    const sonuc=await anon.from(tablo).select('id');
    kontrol(sonuc.error?.code==='42501' || (!sonuc.error && sonuc.data.length===0),`anon ${tablo} okuyabildi`);
  }
  kontrol(storageEngellendi(await anon.storage.from(bucket).download(hesaplar[0].path)),'anon fotoğraf indirme reddi doğrulanamadı');
  kontrol(storageEngellendi(await anon.storage.from(bucket).createSignedUrl(hesaplar[0].path,60)),'anon fotoğraf imzalama reddi doğrulanamadı');
  const anonYol=`${hesaplar[0].user}/${randomUUID()}/0.jpg`;
  const anonYukle=await anon.storage.from(bucket).upload(anonYol,hesaplar[0].bytes,{contentType:'image/jpeg',upsert:false});
  if(!anonYukle.error)hesaplar[0].yollar.push(anonYol);
  kontrol(storageEngellendi(anonYukle),'anon dosya yükleme reddi doğrulanamadı');
  const anonSil=await anon.storage.from(bucket).remove([hesaplar[0].bosPath]);
  kontrol(storageEngellendi(anonSil) || (!anonSil.error && anonSil.data.length===0),'anon dosya silme sınırı doğrulanamadı');
  kontrol(!(await hesaplar[0].client.storage.from(bucket).download(hesaplar[0].bosPath)).error,'anon denemesinden sonra dosya korunmadı');
  console.log(`${sayi} canlı API güvenlik kontrolü geçti. Geçici veriler temizleniyor.`);
}
let hata=false;
try { await calistir(); }
catch (sorun) { hata=true;console.error(sorun instanceof Error ? sorun.message : 'Canlı test tamamlanamadı.'); }
finally {
  for(const h of hesaplar) {
    try {
      // RLS hatası taşıma yaptıysa sahibi kendi setine geri alıp geçici veriyi temizler.
      if(h.memory && h.spheres) {
        const toparla=await h.client.from('memories').update({sphere_id:h.spheres[0].id}).eq('id',h.memory);
        if(toparla.error)throw new Error('Temizleme');
        const sil=await h.client.from('memories').delete().eq('id',h.memory);
        if(sil.error)throw new Error('Temizleme');
      }
      if(h.yollar.length) {
        const sonuc=await h.client.storage.from(bucket).remove(h.yollar);
        if(sonuc.error || sonuc.data.length!==h.yollar.length)throw new Error('Temizleme');
      }
    } catch { hata=true;console.error(`${h.ad}: geçici veriler tamamen temizlenemedi; panelde “Aşama 9 geçici güvenlik testi” ve bu çalışmanın yollarını kontrol et: ${h.yollar.join(', ')}`); }
    await h.client.auth.signOut({scope:'local'});
  }
}
if(hata)process.exitCode=1;
