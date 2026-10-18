const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function yukle({ fetch, session, adres='http://127.0.0.1:8000', env='development' }) {
  const kaynak=fs.readFileSync('services/apiClient.ts','utf8');
  const kod=ts.transpileModule(kaynak,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  const modul={exports:{}};
  vm.runInNewContext(kod,{
    module:modul,exports:modul.exports,Error,TypeError,URL,AbortController,setTimeout,clearTimeout,
    process:{env:{EXPO_PUBLIC_API_URL:adres,NODE_ENV:env}},fetch,
    require:(ad)=>{
      assert.equal(ad,'../lib/supabase');
      return {supabaseIstemcisiniAl:()=>({auth:{getSession:session}})};
    },
  });
  return modul.exports;
}
const oturum=()=>({data:{session:{access_token:'TEST_TOKEN_DO_NOT_PRINT',user:{id:'user-a'}}},error:null});

test('API client mevcut oturum JWTsini başlığa koyar; JSON gönderir',async()=>{
  let istek;
  const {apiIstegi}=yukle({session:async()=>oturum(),fetch:async(url,options)=>{
    istek={url,options};return {ok:true,json:async()=>({id:'memory'})};
  }});
  const sonuc=await apiIstegi('/v1/memories',{yontem:'POST',govde:{title:'Test'}});
  assert.equal(sonuc.id,'memory');
  assert.equal(istek.url,'http://127.0.0.1:8000/v1/memories');
  assert.equal(istek.options.headers.Authorization,'Bearer TEST_TOKEN_DO_NOT_PRINT');
  assert.equal(istek.options.headers['Content-Type'],'application/json');
  assert.equal(istek.options.body,'{"title":"Test"}');
  assert.equal(istek.options.redirect,'error');
});

test('API client oturum yoksa veya adres güvensizse ağ isteği yapmaz',async()=>{
  let calls=0;
  for(const adres of ['', 'http://public.example','https://user:pass@example.test','https://example.test?token=value']) {
    const {apiIstegi}=yukle({adres,session:async()=>oturum(),fetch:async()=>{calls++;}});
    await assert.rejects(apiIstegi('/v1/memories'));
  }
  const {apiIstegi}=yukle({session:async()=>({data:{session:null},error:null}),fetch:async()=>{calls++;}});
  await assert.rejects(apiIstegi('/v1/memories'),e=>e.durum===401&&!e.belirsiz);
  assert.equal(calls,0);
});

test('API client backend hata gövdesini veya token değerini hata mesajına taşımaz',async()=>{
  for(const durum of [401,404,409,422,503]) {
    const {apiIstegi}=yukle({session:async()=>oturum(),fetch:async()=>({ok:false,status:durum,
      json:async()=>({detail:'DATABASE_SECRET'})})});
    await assert.rejects(apiIstegi('/v1/memories',{yontem:'POST',govde:{}}),e=>{
      assert.ok(!e.message.includes('DATABASE_SECRET')&&!e.message.includes('TEST_TOKEN'));
      return e.durum===durum && e.belirsiz===(durum>=500);
    });
  }
});

test('API client ağ veya yanıt hatasında yazmayı belirsiz sayar ve otomatik tekrar etmez',async()=>{
  let calls=0;
  const {apiIstegi}=yukle({session:async()=>oturum(),fetch:async()=>{calls++;throw new Error('network');}});
  await assert.rejects(apiIstegi('/v1/memories',{yontem:'POST'}),e=>e.belirsiz===true);
  assert.equal(calls,1);
  await assert.rejects(apiIstegi('/v1/memories'),e=>e.belirsiz===false);
});

test('API client istek sırasında hesap değişirse sonucu yeni hesaba vermez',async()=>{
  let calls=0;
  const {apiIstegi}=yukle({session:async()=>++calls===1?oturum():{data:{session:{user:{id:'user-b'}}},error:null},
    fetch:async()=>({ok:true,json:async()=>({id:'private'})})});
  await assert.rejects(apiIstegi('/v1/memories',{yontem:'POST'}),e=>e.durum===401&&e.belirsiz);
});

test('Production HTTP reddedilir; telefon geliştirmesinde LAN adresi kullanılabilir',async()=>{
  const guvensiz=yukle({adres:'http://192.168.1.5:8000',env:'production',session:async()=>oturum(),fetch:async()=>{throw new Error('çağrılmamalı');}});
  await assert.rejects(guvensiz.apiIstegi('/v1/memories'));
  const yerel=yukle({adres:'http://192.168.1.5:8000',session:async()=>oturum(),fetch:async()=>({ok:true,json:async()=>({ok:true})})});
  assert.ok((await yerel.apiIstegi('/v1/memories')).ok);
});
