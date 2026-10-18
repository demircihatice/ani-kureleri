const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createClient } = require('@supabase/supabase-js');
const { uiOrtami, nodes, metin } = require('./ui-harness.cjs');
const bekle = () => new Promise((r) => setImmediate(r));
const dugme = (tree, ad) => nodes(tree, (n) => n.props?.accessibilityLabel === ad)[0];

test('Yedi aktif duygu filtrede görünür; eski kategori gösterilmez ve seçim erişilebilirdir', () => {
  const h = uiOrtami(), secimler = [];
  const tree = h.mount('components/ui/DuyguSecimi', 'DuyguFiltreleri', { secili: 'shame', sec: (kod) => secimler.push(kod) });
  const sunum = h.yukle('constants/duyguSunumu');
  assert.equal(sunum.DUYGU_SUNUMU.length, 8);
  assert.doesNotMatch(metin(tree), /nostalji/i);
  assert.equal(nodes(tree, (n) => n.type === 'Pressable').length, 9);
  assert.equal(dugme(tree, 'Utanç').props.accessibilityState.selected, true);
  dugme(tree, 'Tiksinti').props.onPress(); assert.deepEqual(secimler, ['disgust']);
});

test('Eski ana sayfa Galeri yönlendirmesidir; ayrı ekran göstermez', () => {
  const tree = uiOrtami().mount('src/app/ana-sayfa');
  assert.equal(tree.type, 'Redirect'); assert.equal(tree.props.href, '/galeri');
});

test('Yeni anıda manuel duygu seçilmez; API kapalıyken sahte analiz kaydı oluşturulmaz', async () => {
  const h = uiOrtami(); let tree = h.mount('src/app/yeni-ani');
  assert.equal(nodes(tree, (n) => n.props?.accessibilityRole === 'radio').length, 0);
  assert.ok(dugme(tree, 'Ana Küre ile Analiz Et'));
  dugme(tree, 'Ana Küre ile Analiz Et').props.onPress(); tree = h.render(); assert.match(metin(tree), /En az bir fotoğraf/);
  dugme(tree, 'Fotoğraf Ekle').props.onPress(); await bekle(); tree = h.render();
  assert.ok(dugme(tree, 'Seçilen fotoğraf 1'));
  dugme(tree, 'Anı başlığı').props.onChangeText('Yaz akşamı'); tree = h.render();
  dugme(tree, 'Ana Küre ile Analiz Et').props.onPress(); tree = h.render();
  assert.deepEqual(h.yollar, []); assert.match(metin(tree), /backend bağlantısı henüz etkinleştirilmedi/);
  dugme(tree, 'Fotoğraf 1 kaldır').props.onPress(); tree = h.render(); assert.equal(dugme(tree, 'Seçilen fotoğraf 1'), undefined);
});

test('Analiz ekranı başlamamış işlemi açıklar; sonuç bileşeni boş sonuçtan duygu üretmez', () => {
  let h = uiOrtami(), tree = h.mount('src/app/analiz');
  assert.match(metin(tree), /Analiz başlatılmadı/); assert.match(metin(tree), /Anın kaydedilmedi/);
  assert.doesNotMatch(metin(tree), /Duygu Belirlendi|Duygu algılanıyor/);
  h = uiOrtami(); tree = h.mount('components/AnalizSonucu', 'AnalizSonucu', { sonuc: null });
  assert.match(metin(tree), /Henüz analiz sonucu yok/); assert.doesNotMatch(metin(tree), /Neşe|Duygu Belirlendi/);
});

test('Duygu düzenleyici yalnızca UI state değiştirir; kayıt devre dışıdır', () => {
  const h = uiOrtami(), secimler = [];
  const tree = h.mount('components/ui/DuyguSecimi', 'DuyguDuzenleyici', { secili: 'disgust', sec: (kod) => secimler.push(kod) });
  assert.equal(nodes(tree, (n) => n.props?.accessibilityRole === 'radio').length, 8);
  assert.equal(dugme(tree, 'Tiksinti').props.accessibilityState.checked, true);
  assert.equal(dugme(tree, 'Değişikliği Kaydet').props.disabled, true);
});

test('Anı detayı gerçek servis sonucunun duygu badge alanını gösterir', async () => {
  const h = uiOrtami(); h.mount('src/app/ani/[id]', 'AniEkrani', { kullaniciId: 'user-a', id: 'ani-a' });
  await bekle(); const tree = h.render();
  assert.match(metin(tree), /Bir anı/); assert.match(metin(tree), /😊 Neşe/);
  assert.ok(dugme(tree, 'Düzenle')); assert.equal(dugme(tree, 'Sil · Yakında').props.disabled, true);
  assert.doesNotMatch(metin(tree), /Duygu küresi|Bağlı küreye git/);
});

test('Profil gerçek hesap bilgisini ve sayaçlarını gösterir; menüler sahte işlem çalıştırmaz', () => {
  const h = uiOrtami(); h.veri.toplam = 12; h.veri.buAy = 2;
  const tree = h.mount('src/app/profil');
  assert.match(metin(tree), /Test Kullanıcı/); assert.match(metin(tree), /test@example.invalid/);
  assert.match(metin(tree), /12 Toplam Anı/); assert.match(metin(tree), /2 Bu Ay/);
  assert.doesNotMatch(metin(tree), /Duygu Kategorisi|anı tarihi bu ay içinde/);
  assert.ok(dugme(tree, 'Profil fotoğrafını değiştir'));
  assert.ok(dugme(tree, 'Çıkış Yap')); assert.match(metin(tree), /Ana Küre Bağlantısı Yakında/);
});

test('Giriş ve kayıt render olur; şifre tekrarı eşleşmeden Auth çağrılmaz', async () => {
  let kayit = 0;
  const h = uiOrtami({ 'services/authService': { kayitOl: async () => { kayit++; return { dogrulamaGerekli: true }; } } });
  let tree = h.mount('components/AuthFormu', 'AuthFormu', { kayit: true });
  for (const [ad, deger] of [['Ad soyad', 'Test Kişi'], ['E-posta', 'test@example.invalid'], ['Şifre', 'password123'], ['Şifre Tekrar', 'farkli123']]) dugme(tree, ad).props.onChangeText(deger);
  tree = h.render(); dugme(tree, 'Kayıt Ol').props.onPress(); await bekle(); tree = h.render();
  assert.match(metin(tree), /Şifreler eşleşmiyor/); assert.equal(kayit, 0);
  const giris = uiOrtami().mount('components/AuthFormu', 'AuthFormu');
  assert.match(metin(giris), /Hoş geldin/); assert.ok(dugme(giris, 'Giriş Yap')); assert.equal(dugme(giris, 'Şifre Tekrar'), undefined);
});

function servisOrtami({ hata = false, imzaHatasi = false, sayi = 2, fotografAdedi = 1 } = {}) {
  const istekler = [];
  const istemci = createClient('https://test.supabase.co', 'test-key', { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (url, options) => {
    const adres = new URL(url); istekler.push({ adres, options });
    if (options.method === 'HEAD') return new Response(null, { headers: { 'Content-Range': '0-0/12' } });
    if (adres.pathname.includes('/rest/')) {
      const veri = hata ? { code: '42501' } : Array.from({ length: sayi }, (_, i) => ({ id: `ani-${i}`, title: `Anı ${i}`, memory_date: '2026-10-01', image_url: `user-a/ani-${i}/eski.jpg`,
        spheres: { emotion_type: i === 0 ? 'mutluluk' : 'nostalji' }, memory_images: Array.from({length:fotografAdedi}, (_, sira) => ({ storage_path: `user-a/ani-${i}/${sira}.jpg`, sort_order: sira })) }));
      return new Response(JSON.stringify(veri), { status: hata ? 403 : 200, headers: { 'Content-Type': 'application/json' } });
    }
    const paths = JSON.parse(options.body).paths;
    return new Response(JSON.stringify(imzaHatasi ? { message: 'offline' } : paths.map((p) => ({ path: p, signedURL: `/object/sign/ani-fotograflari/${p}?token=test` })).reverse()), { status: imzaHatasi ? 500 : 200, headers: { 'Content-Type': 'application/json' } });
  } } });
  const h = uiOrtami({ 'lib/supabase': { supabaseIstemcisiniAl: () => istemci } });
  return { ...h.yukle('services/galleryService'), istekler };
}

test('Galeri sorgusu kullanıcı filtresi, sayfalama ve sıralı kapak imzası kullanır; eski anı silinmez', async () => {
  const s = servisOrtami(), sonuc = await s.galeriyiGetir('user-a', 'tumu', 0, new AbortController().signal);
  assert.equal(sonuc.toplam, 12); assert.equal(sonuc.anilar.length, 2);
  assert.equal(sonuc.anilar[0].duygu, 'joy'); assert.equal(sonuc.anilar[1].duygu, null);
  assert.ok(sonuc.anilar[0].kapak.includes('/ani-0/0.jpg'));
  const q = s.istekler.find((i) => i.options.method !== 'HEAD').adres.searchParams;
  assert.equal(q.get('order'), 'memory_date.desc,created_at.desc,id.desc'); assert.equal(q.get('limit'), '31');
  assert.equal(q.get('memory_images.order'), 'sort_order.asc'); assert.equal(q.get('memory_images.limit'), '1');
  for (const istek of s.istekler.filter((i) => i.adres.pathname.includes('/rest/'))) assert.equal(istek.adres.searchParams.get('user_id'), 'eq.user-a');
});

test('Duygu filtresi inner join ile üst satırları sınırlar; yeni kategorilere sahte veri atanmaz', async () => {
  const s = servisOrtami(); await s.galeriyiGetir('user-a', 'sadness', 30, new AbortController().signal);
  const q = s.istekler.find((i) => i.options.method !== 'HEAD').adres.searchParams;
  assert.ok(q.get('select').includes('spheres!inner')); assert.equal(q.get('spheres.emotion_type'), 'eq.huzun'); assert.equal(q.get('offset'), '30');
  const t = servisOrtami(), bos = await t.galeriyiGetir('user-a', 'shame', 0, new AbortController().signal);
  assert.equal(bos.anilar.length, 0); assert.equal(t.istekler.length, 2);
});

test('Galeri hataları boş başarı sayılmaz; Storage hatası metinleri gizlemez; sınırda 30 kapak okunur', async () => {
  const hata = servisOrtami({ hata: true }); await assert.rejects(hata.galeriyiGetir('user-a', 'tumu', 0, new AbortController().signal));
  const s = servisOrtami({ imzaHatasi: true }), sonuc = await s.galeriyiGetir('user-a', 'tumu', 0, new AbortController().signal);
  assert.equal(sonuc.anilar[0].baslik, 'Anı 0'); assert.equal(sonuc.fotografUyarisi, true);
  const p = servisOrtami({ sayi: 31 }), sayfa = await p.galeriyiGetir('user-a', 'tumu', 0, new AbortController().signal);
  assert.equal(sayfa.anilar.length, 30); assert.equal(sayfa.devamVar, true);
  const bos = servisOrtami(); await assert.rejects(bos.galeriyiGetir('', 'tumu', 0, new AbortController().signal)); assert.equal(bos.istekler.length, 0);
});

test('Profil özeti fotoğraf indirmez veya Storage imzası istemez', async () => {
  const s = servisOrtami();
  const ozet = await s.galeriyiGetir('user-a', 'tumu', 0, new AbortController().signal, true);
  assert.equal(ozet.toplam, 12); assert.equal(s.istekler.length, 2);
  assert.ok(s.istekler.every((istek) => istek.options.method === 'HEAD'));
});

test('Galeri hook hesap değişiminde önceki veriyi gizler ve eski istek sonucunu reddeder', async () => {
  let kullanici = 'user-a', anlik;
  const istekler = [];
  const h = uiOrtami({
    'hooks/useGaleri': undefined,
    'services/galleryService': { galeriyiGetir: (uid, filtre, offset, sinyal) => new Promise((bitir) => istekler.push({ uid, filtre, offset, sinyal, bitir })) },
    'test-kok': { default: () => { anlik = h.yukle('hooks/useGaleri').useGaleri(kullanici); return null; } },
  });
  h.mount('test-kok');
  const sayfa = (id) => ({ anilar: [{ id }], toplam: 1, buAy: 1, devamVar: false, fotografUyarisi: false });
  istekler[0].bitir(sayfa('ani-a')); await bekle(); h.render(); assert.equal(anlik.veri.anilar[0].id, 'ani-a');
  anlik.yenile(); const eskiIstek = istekler[1];
  kullanici = 'user-b'; h.render(); assert.equal(anlik.veri, null); assert.equal(eskiIstek.sinyal.aborted, true);
  eskiIstek.bitir(sayfa('eski-ani-a')); await bekle(); h.render(); assert.equal(anlik.veri, null);
  istekler[2].bitir(sayfa('ani-b')); await bekle(); h.render(); assert.equal(anlik.veri.anilar[0].id, 'ani-b');
});

test('Galeri sayfalaması çift tıklamayı kilitler; yenileme geç gelen sayfayı iptal eder', async () => {
  let anlik;
  const istekler = [];
  const h = uiOrtami({
    'hooks/useGaleri': undefined,
    'services/galleryService': { galeriyiGetir: (uid, filtre, offset, sinyal) => new Promise((bitir) => istekler.push({ uid, filtre, offset, sinyal, bitir })) },
    'test-kok': { default: () => { anlik = h.yukle('hooks/useGaleri').useGaleri('user-a'); return null; } },
  });
  const sayfa = { anilar: [{ id: 'ilk' }], toplam: 31, buAy: 0, devamVar: true, fotografUyarisi: false };
  h.mount('test-kok'); istekler[0].bitir(sayfa); await bekle(); h.render();
  anlik.dahaFazla(); anlik.dahaFazla(); assert.equal(istekler.length, 2); assert.equal(istekler[1].offset, 1);
  anlik.yenile(); assert.equal(istekler[1].sinyal.aborted, true);
  istekler[1].bitir({ ...sayfa, anilar: [{ id: 'gec' }] }); await bekle();
  istekler[2].bitir(sayfa); await bekle(); h.render();
  assert.equal(anlik.veri.anilar.length, 1); assert.equal(anlik.veri.anilar[0].id, 'ilk');
});

test('Galeri sekmesi yalnız sık fotoğraf ızgarası gösterir ve seçilen duygu ile tüm fotoğrafları ister', () => {
  const istekler=[];
  const anilar=Array.from({length:6},(_,i)=>({id:`ani-${i}`,baslik:'Görünmeyen başlık',tarih:'2026-10-17',duygu:'sadness',kapak:'signed',fotografYolu:`user-a/${i}.jpg`,fotografSirasi:0}));
  const h=uiOrtami({'hooks/useGaleri':{useGaleri:(...args)=>{istekler.push(args);return{veri:{anilar,toplam:6},yenile(){},dahaFazla(){}};}}});
  let tree=h.mount('src/app/galeri');
  const grid=nodes(tree,n=>n.type==='FlatList')[0];
  assert.equal(grid.props.numColumns,5);assert.equal(grid.props.data.length,10);
  assert.deepEqual(istekler[0],['user-a','tumu',false,true]);
  assert.doesNotMatch(metin(tree),/Anıların Galerisi|Görünmeyen başlık|2026-10-17|Yenile/);
  dugme(tree,'Üzüntü').props.onPress();tree=h.render();
  assert.deepEqual(istekler.at(-1),['user-a','sadness',false,true]);
  const kare=uiOrtami();
  const tile=kare.mount('components/FotografGaleriEkrani','FotografKaresi',{fotograf:{...anilar[0],fotografSirasi:2}});
  assert.equal(metin(tile).trim(),'');
  nodes(tile,n=>n.type==='Pressable')[0].props.onPress();
  assert.equal(kare.yollar[0].params.foto,'2');
});

test('Fotoğraf galerisinde kapak sınırlaması yoktur; tüm fotoğraflar sıralanır, sayfa anı sayısıyla ilerler', async () => {
  const s=servisOrtami({fotografAdedi:3});
  const sonuc=await s.galeriyiGetir('user-a','tumu',0,new AbortController().signal,false,true);
  const q=s.istekler.find(i=>i.options.method!=='HEAD').adres.searchParams;
  assert.equal(q.get('memory_images.limit'),null);assert.equal(q.get('memory_images.order'),'sort_order.asc');
  assert.equal(sonuc.anilar.length,6);assert.equal(sonuc.sonrakiBaslangic,2);
  assert.deepEqual(Array.from(sonuc.anilar,a=>a.fotografSirasi),[0,1,2,0,1,2]);
  for(let i=0;i<3;i++)assert.ok(sonuc.anilar[i].kapak.includes(`/ani-0/${i}.jpg`));
});

test('Çoklu fotoğraf sayfalamasında sonraki anı offseti kullanılır, aynı anının farklı fotoğrafları korunur',async()=>{
  let snapshot;const istekler=[];
  const h=uiOrtami({
    'hooks/useGaleri':undefined,
    'services/galleryService':{galeriyiGetir:async(_uid,_filtre,offset,_signal,_ozet,tum)=>{
      istekler.push([offset,tum]);
      return{anilar:[0,1].map(i=>({id:`ani-${offset}`,fotografYolu:`${offset}/${i}.jpg`})),sonrakiBaslangic:offset+1,devamVar:offset===0};
    }},
    'test-foto-hook':{default:()=>{snapshot=h.yukle('hooks/useGaleri').useGaleri('user-a','tumu',false,true);return null;}},
  });
  h.mount('test-foto-hook');await bekle();h.render();await snapshot.dahaFazla();h.render();
  assert.deepEqual(istekler,[[0,true],[1,true]]);assert.equal(snapshot.veri.anilar.length,4);h.unmount();
});
