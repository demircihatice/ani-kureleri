const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { createClient } = require('@supabase/supabase-js');

function yukle(dosya, bagimliliklar) {
  const modul = { exports: {} };
  const kod = ts.transpileModule(fs.readFileSync(dosya,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(kod,{module:modul,exports:modul.exports,Error,Date,Number,
    require:(ad)=>{if (!(ad in bagimliliklar)) throw new Error(ad);return bagimliliklar[ad];}});
  return modul.exports;
}
const form={baslik:'  Yeni başlık  ',aciklama:'  Açıklama  ',tarih:'2024-02-29',kureId:'nostalji-a'};
const ani={id:'ani-a',title:'Başlık',description:null,memory_date:'2020-01-02',sphere_id:'mutluluk-a',
  image_url:'user-a/ani-a/0.jpg',memory_images:[0,1,2].map((n)=>({id:`foto-${n}`,storage_path:`user-a/ani-a/${n}.jpg`,sort_order:n}))};
function ortam({satir=ani,hata=null,imzaHatasi=false}={}) {
  const istekler=[];
  const istemci=createClient('https://test.supabase.co','test-key',{
    auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(url,options)=>{
      const adres=new URL(url);istekler.push({adres,options});
      let veri;
      if(adres.pathname.includes('/rest/')) {
        veri=hata ?? (options.method==='PATCH' ? {...ani,...JSON.parse(options.body)} : (satir ? [satir] : []));
      } else {
        if(imzaHatasi) return new Response(JSON.stringify({message:'offline'}),{status:500,headers:{'Content-Type':'application/json'}});
        veri=JSON.parse(options.body).paths.map((path)=>({path,error:null,signedURL:`/object/sign/ani-fotograflari/${path}?token=test`})).reverse();
      }
      return new Response(JSON.stringify(veri),{status:hata ? 406 : 200,headers:{'Content-Type':'application/json'}});
    }},
  });
  return {...yukle('services/memoryService.ts',{
    '../lib/supabase':{supabaseIstemcisiniAl:()=>istemci},'../constants/ani':{FOTO_BUCKET:'ani-fotograflari'},'./photoService':{},
    '../lib/aniDogrulama':yukle('lib/aniDogrulama.ts',{'../constants/ani':{EN_FAZLA_FOTOGRAF:5}}),
  }),istekler};
}

test('Detay sorgusu kullanıcı ve anı kimliğini filtreler; tüm fotoğrafları sıralı ve doğru imzayla döndürür',async()=>{
  const s=ortam(),sinyal=new AbortController().signal;
  const sonuc=await s.aniDetayiniGetir('user-a','ani-a',sinyal);
  const q=s.istekler[0].adres.searchParams;
  assert.equal(q.get('id'),'eq.ani-a');assert.equal(q.get('user_id'),'eq.user-a');
  assert.equal(q.get('memory_images.order'),'sort_order.asc');assert.equal(q.get('memory_images.limit'),null);
  assert.equal(s.istekler[0].options.signal,sinyal);assert.equal(sonuc.fotograflar.length,3);
  for(let i=0;i<3;i++)assert.ok(sonuc.fotograflar[i].url.includes(`/ani-a/${i}.jpg`));
  assert.equal(JSON.parse(s.istekler[1].options.body).expiresIn,600);
});
test('Eski anı kapak yolunu kullanır; Storage hatası metin bilgilerini gizlemez',async()=>{
  const s=ortam({satir:{...ani,memory_images:[]},imzaHatasi:true});
  const sonuc=await s.aniDetayiniGetir('user-a','ani-a',new AbortController().signal);
  assert.equal(sonuc.title,ani.title);assert.equal(sonuc.fotograflar.length,1);
  assert.equal(sonuc.fotograflar[0].yol,ani.image_url);assert.equal(sonuc.fotograflar[0].url,null);
});
test('Bulunamayan/yabancı anı Storage sorgusuna geçmez',async()=>{
  const s=ortam({satir:null});
  await assert.rejects(s.aniDetayiniGetir('user-b','ani-a',new AbortController().signal),/hesabına ait değil/);
  assert.equal(s.istekler.length,1);
});
test('Güncelleme yalnızca dört düzenlenebilir alanı yollar; sahiplik filtresi ve gerçek satır yanıtı kullanılır',async()=>{
  const s=ortam(),sonuc=await s.aniyiGuncelle('user-a','ani-a',form,['nostalji-a']);
  assert.equal(s.istekler.length,1);const {adres,options}=s.istekler[0];
  assert.equal(options.method,'PATCH');assert.equal(adres.searchParams.get('id'),'eq.ani-a');
  assert.equal(adres.searchParams.get('user_id'),'eq.user-a');
  assert.deepEqual(JSON.parse(options.body),{title:'Yeni başlık',description:'Açıklama',memory_date:'2024-02-29',sphere_id:'nostalji-a'});
  assert.equal(sonuc.sphere_id,'nostalji-a');assert.equal(sonuc.id,'ani-a');
});
test('Boş açıklama null kaydedilir; fotoğraf ve Storage değişikliği yapılmaz',async()=>{
  const s=ortam();await s.aniyiGuncelle('user-a','ani-a',{...form,aciklama:'  '},['nostalji-a']);
  assert.equal(JSON.parse(s.istekler[0].options.body).description,null);assert.equal(s.istekler.length,1);
});

test('Yeni detay düzenlemesi sphere_id veya AI alanı göndermeden yalnızca metin ve tarihi günceller',async()=>{
  const s=ortam();
  await s.aniBilgileriniGuncelle('user-a','ani-a',form);
  assert.equal(s.istekler.length,1);
  const {adres,options}=s.istekler[0];
  assert.equal(adres.searchParams.get('user_id'),'eq.user-a');
  assert.equal(adres.searchParams.get('id'),'eq.ani-a');
  assert.deepEqual(JSON.parse(options.body),{title:'Yeni başlık',description:'Açıklama',memory_date:'2024-02-29'});
});
test('Sıfır satır, RLS reddi ve ağ hatası başarı olarak kabul edilmez',async()=>{
  for(const [code,mesaj] of [['PGRST116',/hesabına ait değil/],['42501',/düzenleyemezsin/],['',/doğrulanamadı/]]) {
    const s=ortam({hata:{code,message:'failed'}});
    await assert.rejects(s.aniyiGuncelle('user-a','ani-a',form,['nostalji-a']),mesaj);
  }
});
test('Geçersiz tarih, başlık, açıklama ve yabancı küre HTTP isteği olmadan reddedilir',async()=>{
  const s=ortam();
  for(const degisim of [{baslik:' '},{baslik:'x'.repeat(201)},{aciklama:'x'.repeat(5001)},{tarih:'2023-02-29'},{kureId:'yabanci-kure'}])
    await assert.rejects(s.aniyiGuncelle('user-a','ani-a',{...form,...degisim},['nostalji-a']));
  await assert.rejects(s.aniyiGuncelle('','ani-a',form,['nostalji-a']));
  assert.equal(s.istekler.length,0);
});
