const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function yukle(dosya, bagimliliklar) {
  const modul = { exports: {} };
  const kod = ts.transpileModule(fs.readFileSync(dosya,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(kod,{ module: modul,exports: modul.exports,Error,Date,Number,
    require: (ad) => { if (!(ad in bagimliliklar)) throw new Error(`Beklenmeyen bağımlılık ${ad}`); return bagimliliklar[ad]; } });
  return modul.exports;
}
const form = { baslik: 'Test',aciklama: '',tarih: '2024-02-29',kureId: 'kure-a',fotograflar: [{ uri:'file:a',width:100,height:100 }] };
const dogrulama = yukle('lib/aniDogrulama.ts',{ '../constants/ani': { EN_FAZLA_FOTOGRAF:5 } });
function deneme() {
  return { id:'ani-a',kullaniciId:'user-a',form:{ ...form,fotograflar:[...form.fotograflar] },yollar:['user-a/ani-a/0.jpg'],yuklemeTamam:false };
}
function ortam({ uploadHata=null,rpcHata=null,rpcAt=false,removeHata=null,sessionId='user-a' }={}) {
  const yuklenen = [],silinen = [],cagrilar = [];
  const istemci = {
    auth:{ getSession:async()=>({ data:{session:sessionId ? {user:{id:sessionId}} : null} }) },
    storage:{ from:(bucket)=>{
      assert.equal(bucket,'ani-fotograflari');
      return {
        upload:async(yol,veri,secenek)=>{ yuklenen.push(yol); assert.ok(veri instanceof ArrayBuffer); assert.equal(secenek.upsert,false); assert.equal(secenek.contentType,'image/jpeg'); return { error: typeof uploadHata==='function' ? uploadHata(yuklenen.length) : uploadHata }; },
        remove:async(yollar)=>{ silinen.push(...yollar); return {error:removeHata}; },
      };
    } },
    rpc:async(ad,params)=>{ cagrilar.push({ad,params}); if (rpcAt) throw new TypeError('network'); return {data:params.p_id,error:rpcHata}; },
  };
  return { ...yukle('services/memoryService.ts',{
    '../lib/supabase':{supabaseIstemcisiniAl:()=>istemci},'../constants/ani':{FOTO_BUCKET:'ani-fotograflari'},
    './photoService':{fotografiHazirla:async()=>new ArrayBuffer(10)},
    '../lib/aniDogrulama':dogrulama,
  }),yuklenen,silinen,cagrilar };
}

test('Form geçersiz tarihi, boş başlığı, yabancı küreyi ve fotoğraf sınırlarını reddeder',()=>{
  assert.equal(dogrulama.aniFormunuDogrula(form,['kure-a']),null);
  for(const bozuk of [{baslik:' '},{tarih:'2023-02-29'},{tarih:'2024-13-01'},{kureId:'kure-b'},{fotograflar:[]},{fotograflar:Array(6).fill(form.fotograflar[0])},{aciklama:'x'.repeat(5001)}]) {
    assert.ok(dogrulama.aniFormunuDogrula({...form,...bozuk},['kure-a']));
  }
  assert.equal(dogrulama.yerelTarih(new Date(2020,0,2)),'2020-01-02');
});
test('İki fotoğraf önce yüklenir; tek RPC doğru küreyle ve aynı anı UUIDsiyle çağrılır',async()=>{
  const s=ortam(),d=deneme(); d.form.fotograflar.push(form.fotograflar[0]);d.yollar.push('user-a/ani-a/1.jpg');
  assert.equal(await s.aniyiKaydet(d,()=>{}),'ani-a');
  assert.equal(s.yuklenen.length,2);assert.equal(s.cagrilar.length,1);
  assert.equal(s.cagrilar[0].ad,'ani_olustur');assert.equal(s.cagrilar[0].params.p_sphere_id,'kure-a');
  assert.equal(s.cagrilar[0].params.p_paths.length,2);assert.equal(s.silinen.length,0);
});
test('İkinci yükleme başarısızsa RPC yapılmaz; başarılı ve sonucu belirsiz yüklemeler temizlenir',async()=>{
  const s=ortam({uploadHata:(sira)=>sira===2 ? {message:'network'} : null}),d=deneme();
  d.form.fotograflar.push(form.fotograflar[0]);d.yollar.push('user-a/ani-a/1.jpg');
  await assert.rejects(s.aniyiKaydet(d,()=>{}),(h)=>!h.belirsiz);
  assert.equal(s.cagrilar.length,0);assert.equal(s.silinen.length,2);assert.equal(d.yuklemeTamam,false);
});
test('Kesin veritabanı hatasında yüklenen dosyalar temizlenir',async()=>{
  const s=ortam({rpcHata:{code:'42501'}});
  await assert.rejects(s.aniyiKaydet(deneme(),()=>{}),(h)=>!h.belirsiz);
  assert.equal(s.silinen.length,1);
});
test('Kaybolan RPC yanıtında dosyalar korunur; yeniden deneme aynı UUIDyi kullanır ve tekrar yüklemez',async()=>{
  const s=ortam({rpcAt:true}),d=deneme();
  await assert.rejects(s.aniyiKaydet(d,()=>{}),(h)=>h.belirsiz);
  assert.equal(s.silinen.length,0);assert.equal(d.yuklemeTamam,true);
  const yeni=ortam();assert.equal(await yeni.aniyiKaydet(d,()=>{}),'ani-a');
  assert.equal(yeni.yuklenen.length,0);assert.equal(yeni.cagrilar[0].params.p_id,'ani-a');
});
test('SDK ağ hatası da belirsiz kalır; cleanup başarısızlığı kullanıcıya bildirilir',async()=>{
  const s=ortam({rpcHata:{code:'',message:'Failed to fetch'}});
  await assert.rejects(s.aniyiKaydet(deneme(),()=>{}),(h)=>h.belirsiz);
  assert.equal(s.silinen.length,0);
  const t=ortam({uploadHata:{message:'fail'},removeHata:{message:'network'}});
  await assert.rejects(t.aniyiKaydet(deneme(),()=>{}),/temizlenemedi/);
});
test('Oturum değişirse başka kullanıcıyla yükleme veya kayıt yapılmaz',async()=>{
  for(const sessionId of ['user-b',null]) {
    const s=ortam({sessionId});await assert.rejects(s.aniyiKaydet(deneme(),()=>{}),/Oturum değişti/);
    assert.equal(s.yuklenen.length,0);assert.equal(s.cagrilar.length,0);
  }
});
