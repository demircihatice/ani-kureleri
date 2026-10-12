const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { createClient } = require('@supabase/supabase-js');

function yukle(dosya, bagimliliklar) {
  const modul = { exports: {} };
  const kod = ts.transpileModule(fs.readFileSync(dosya,'utf8'), { compilerOptions:{ module:ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(kod,{ module:modul,exports:modul.exports,Error,Number,Set,AbortController,
    require:(ad)=>{ if (!(ad in bagimliliklar)) throw new Error(ad); return bagimliliklar[ad]; } });
  return modul.exports;
}
function ortam(satirlar,{ hata=false,imzaHatasi=false,ters=false }={}) {
  const istekler=[];
  const istemci=createClient('https://test.supabase.co','test-key',{
    auth:{persistSession:false,autoRefreshToken:false},
    global:{fetch:async(url,options)=>{
      const adres=new URL(url);istekler.push({adres,options});
      if(adres.pathname.includes('/rest/')) {
        return new Response(JSON.stringify(hata ? {code:'42501',message:'denied'} : satirlar),{
          status:hata ? 403 : 200,headers:{'Content-Type':'application/json','Content-Range':'0-20/43'},
        });
      }
      const veri=JSON.parse(options.body);
      if(imzaHatasi) return new Response(JSON.stringify({message:'offline'}),{status:500,headers:{'Content-Type':'application/json'}});
      const imzalar=veri.paths.map((path)=>({path,error:null,signedURL:`/object/sign/ani-fotograflari/${path}?token=test`}));
      return new Response(JSON.stringify(ters ? imzalar.reverse() : imzalar),{headers:{'Content-Type':'application/json'}});
    }},
  });
  return {...yukle('services/memoryService.ts',{
    '../lib/supabase':{supabaseIstemcisiniAl:()=>istemci},'../constants/ani':{FOTO_BUCKET:'ani-fotograflari',ANI_SAYFA_BOYUTU:20},
    './photoService':{},
    '../lib/aniDogrulama':yukle('lib/aniDogrulama.ts',{'../constants/ani':{EN_FAZLA_FOTOGRAF:5}}),
  }),istekler};
}
const satir=(n)=>({id:`ani-${n}`,title:`Anı ${n}`,memory_date:'2020-01-02',image_url:`user-a/ani-${n}/eski.jpg`,
  memory_images:[{storage_path:`user-a/ani-${n}/0.jpg`,sort_order:0}]});

test('Gerçek SDK sorgusu kullanıcı/küre filtreleri, kararlı tarih sırası ve ilk fotoğraf seçimini taşır',async()=>{
  const s=ortam([satir(1)]),sinyal=new AbortController().signal;
  const sonuc=await s.kureAnilariniGetir('user-a','kure-a',sinyal,20);
  const q=s.istekler[0].adres.searchParams;
  assert.equal(q.get('user_id'),'eq.user-a');assert.equal(q.get('sphere_id'),'eq.kure-a');
  assert.equal(q.get('order'),'memory_date.desc,created_at.desc,id.desc');
  assert.equal(q.get('memory_images.order'),'sort_order.asc');assert.equal(q.get('memory_images.limit'),'1');
  assert.equal(q.get('offset'),'20');assert.equal(q.get('limit'),'21');
  assert.equal(s.istekler[0].options.signal,sinyal);
  assert.equal(sonuc.anilar[0].image_url,'user-a/ani-1/0.jpg');assert.equal(sonuc.toplam,43);
  assert.equal(JSON.parse(s.istekler[1].options.body).expiresIn,600);
});
test('Fazladan satır yalnızca sonraki sayfa kontrolüdür; en fazla 20 kapak imzalanır',async()=>{
  const s=ortam(Array.from({length:21},(_,i)=>satir(i))),sonuc=await s.kureAnilariniGetir('user-a','kure-a',new AbortController().signal);
  assert.equal(sonuc.anilar.length,20);assert.equal(sonuc.devamVar,true);
  assert.equal(JSON.parse(s.istekler[1].options.body).paths.length,20);
});
test('Storage yanıt sırası değişse bile kapaklar doğru anıyla eşleşir',async()=>{
  const s=ortam([satir(1),satir(2)],{ters:true});
  const sonuc=await s.kureAnilariniGetir('user-a','kure-a',new AbortController().signal);
  assert.ok(sonuc.anilar[0].fotografUrl.includes('/ani-1/0.jpg'));assert.ok(sonuc.anilar[1].fotografUrl.includes('/ani-2/0.jpg'));
});
test('Fotoğraf satırı olmayan eski anıda image_url kullanılır; boş kürede Storage çağrılmaz',async()=>{
  const eski={...satir(1),memory_images:[]};const s=ortam([eski]);
  const sonuc=await s.kureAnilariniGetir('user-a','kure-a',new AbortController().signal);
  assert.equal(sonuc.anilar[0].image_url,eski.image_url);
  const bos=ortam([]),son=await bos.kureAnilariniGetir('user-a','kure-a',new AbortController().signal);
  assert.equal(son.anilar.length,0);assert.equal(son.devamVar,false);assert.equal(bos.istekler.length,1);
});
test('Veritabanı hatası boş liste sayılmaz; fotoğraf hatası başlık ve tarihi gizlemez',async()=>{
  const s=ortam([],{hata:true});await assert.rejects(s.kureAnilariniGetir('user-a','kure-a',new AbortController().signal),(h)=>h.code==='42501');
  const t=ortam([satir(1)],{imzaHatasi:true});
  const sonuc=await t.kureAnilariniGetir('user-a','kure-a',new AbortController().signal);
  assert.equal(sonuc.anilar[0].title,'Anı 1');assert.equal(sonuc.anilar[0].fotografUrl,null);assert.equal(sonuc.fotografUyarisi,true);
});
test('Eksik kimlik veya geçersiz sayfa sunucuya gönderilmez',async()=>{
  const s=ortam([]);
  for(const [user,kure,offset] of [['','kure-a',0],['user-a','',0],['user-a','kure-a',-1],['user-a','kure-a',0.5]]) {
    await assert.rejects(s.kureAnilariniGetir(user,kure,new AbortController().signal,offset));
  }
  assert.equal(s.istekler.length,0);
});

// Hook'un istek sıralama ve iptal davranışını kontrol eder; gerçek ekrana render yapmaz.
function hookOrtami(sayfaGetir) {
  let durum,temizle;
  const eylemRef={current:null};
  const hook=yukle('hooks/useKureAnilari.ts',{
    react:{useCallback:(f)=>f,useRef:()=>eylemRef,useState:(ilk)=>{durum=ilk;return[ilk,(yeni)=>{durum=yeni;}];}},
    'react-native':{AppState:{addEventListener:()=>({remove(){}})}},
    'expo-router':{useFocusEffect:(f)=>{temizle=f();}},
    '../services/sphereService':{kureSetiniGetir:async()=>({kureler:[{id:'kure-a',name:'Mutluluk'}]})},
    '../services/memoryService':{kureAnilariniGetir:sayfaGetir},'../constants/ani':{ANI_SAYFA_BOYUTU:20},
  });
  const eylemler=hook.useKureAnilari('user-a','kure-a');
  return {eylemler,durum:()=>durum,temizle:()=>temizle()};
}
const bekle=()=>new Promise((r)=>setImmediate(r));
test('Arka arkaya daha fazla isteği tek çağrı olur; hatadan sonra aynı sayfa yeniden denenir',async()=>{
  const sayfa={anilar:[satir(1)],devamVar:true,toplam:43,fotografUyarisi:false};
  let offsetler=[],ikinciBitir;
  const h=hookOrtami(async(_user,_kure,_sinyal,offset=0)=>{
    offsetler.push(offset);if(offset===0)return sayfa;
    return new Promise((resolve,reject)=>{ikinciBitir={resolve,reject};});
  });
  await bekle();h.eylemler.dahaFazla();h.eylemler.dahaFazla();
  assert.deepEqual(offsetler,[0,20]);ikinciBitir.reject(new Error('offline'));await bekle();
  assert.equal(h.durum().bilgi.anilar.length,1);assert.ok(h.durum().hata);
  h.eylemler.dahaFazla();assert.deepEqual(offsetler,[0,20,20]);
  ikinciBitir.resolve({...sayfa,anilar:[satir(2)],devamVar:false});await bekle();
  assert.equal(h.durum().bilgi.anilar.length,2);assert.equal(h.durum().hata,null);h.temizle();
});
test('Yenile eski sayfa isteğini iptal eder; geç dönen sonuç yeni listeyi ezmez',async()=>{
  const sayfa={anilar:[satir(1)],devamVar:true,toplam:43,fotografUyarisi:false};
  let gecBitir,sinyal;
  const h=hookOrtami(async(_user,_kure,s,offset=0)=>{
    if(offset===0)return sayfa;sinyal=s;return new Promise((resolve)=>{gecBitir=resolve;});
  });
  await bekle();h.eylemler.dahaFazla();h.eylemler.yenile();await bekle();
  assert.equal(sinyal.aborted,true);gecBitir({...sayfa,anilar:[satir(2)]});await bekle();
  assert.equal(h.durum().bilgi.anilar.length,1);assert.equal(h.durum().bilgi.anilar[0].id,'ani-1');h.temizle();
});
