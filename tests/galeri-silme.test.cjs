const {test}=require('node:test');
const assert=require('node:assert/strict');
const {uiOrtami,nodes,metin}=require('./ui-harness.cjs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const button=(tree,label)=>nodes(tree,n=>n.props.accessibilityLabel===label)[0];
const foto=(n)=>({id:'ani-a',fotografYolu:`user-a/ani-a/${n}.jpg`,fotografSirasi:n,baslik:'Anı',kapak:'signed',tarih:'2026-01-01',duygu:'joy'});

test('Basılı tutmak seçim açar; dokunma seçimi değiştirir, çöp kutusu yalnız seçilenleri siler ve liste yenilenir',async()=>{
  let yenileme=0,bitir;const cagrilar=[];
  const h=uiOrtami({'hooks/useGaleri':{useGaleri:()=>({veri:{anilar:[foto(0),foto(1)],toplam:1},yenile(){yenileme++;},dahaFazla(){}})},
    'services/galleryDeleteService':{galeriFotograflariniSil:(uid,photos)=>{cagrilar.push({uid,photos});return new Promise(resolve=>bitir=resolve);}}});
  let tree=h.mount('src/app/galeri');
  const tile=i=>{const grid=nodes(tree,n=>n.type==='FlatList')[0];return grid.props.renderItem({item:grid.props.data[i]});};
  tile(0).props.secimeBasla(foto(0));tree=h.render();assert.match(metin(tree),/1\s+seçildi/);assert.equal(h.yollar.length,0);
  tile(1).props.ac(foto(1));tree=h.render();assert.match(metin(tree),/2\s+seçildi/);
  tile(0).props.ac(foto(0));tree=h.render();assert.match(metin(tree),/1\s+seçildi/);
  button(tree,'Seçili fotoğrafları kalıcı sil').props.onPress();tree=h.render();
  assert.equal(cagrilar.length,0);assert.match(metin(tree),/Anılar silinsin mi/);assert.match(metin(tree),/Seçtiğin anıları silmek istediğine emin misin/);
  assert.doesNotMatch(metin(tree),/Son fotoğrafı|geri alınamaz/);
  button(tree,'Silmekten vazgeç').props.onPress();tree=h.render();assert.equal(cagrilar.length,0);
  assert.equal(button(tree,'Seçili fotoğrafları kalıcı sil'),undefined);assert.equal(tile(1).props.secimModu,false);assert.equal(tile(1).props.secili,false);
  tile(1).props.secimeBasla(foto(1));tree=h.render();
  button(tree,'Seçili fotoğrafları kalıcı sil').props.onPress();tree=h.render();
  const sil=button(tree,'Kalıcı silmeyi onayla');sil.props.onPress();sil.props.onPress();tree=h.render();
  assert.equal(cagrilar.length,1);assert.equal(cagrilar[0].uid,'user-a');assert.deepEqual(Array.from(cagrilar[0].photos,f=>f.fotografYolu),[foto(1).fotografYolu]);
  assert.equal(button(tree,'Seçili fotoğrafları kalıcı sil').props.disabled,true);
  bitir();await tick();tree=h.render();assert.equal(yenileme,1);assert.equal(button(tree,'Seçili fotoğrafları kalıcı sil'),undefined);
});

test('Silme hatasında seçim korunur; filtre değişimi veya Vazgeç seçim modunu kapatır',async()=>{
  const h=uiOrtami({'hooks/useGaleri':{useGaleri:()=>({veri:{anilar:[foto(0)],toplam:1},yenile(){},dahaFazla(){}})},
    'services/galleryDeleteService':{galeriFotograflariniSil:async()=>{throw Error('Tekrar dene.');}}});
  let tree=h.mount('src/app/galeri');
  const basla=()=>{const g=nodes(tree,n=>n.type==='FlatList')[0];g.props.renderItem({item:foto(0)}).props.secimeBasla(foto(0));tree=h.render();};
  basla();button(tree,'Seçili fotoğrafları kalıcı sil').props.onPress();tree=h.render();
  button(tree,'Kalıcı silmeyi onayla').props.onPress();await tick();tree=h.render();
  assert.match(metin(tree),/Tekrar dene/);assert.match(metin(tree),/1\s+seçildi/);
  button(tree,'Seçimden vazgeç').props.onPress();tree=h.render();assert.equal(button(tree,'Seçili fotoğrafları kalıcı sil'),undefined);
  basla();button(tree,'Üzüntü').props.onPress();tree=h.render();assert.equal(button(tree,'Seçili fotoğrafları kalıcı sil'),undefined);
  const tile=uiOrtami().mount('components/FotografGaleriEkrani','FotografKaresi',{fotograf:foto(0),secimModu:true,secili:true,secimeBasla(){}});
  assert.equal(tile.props.accessibilityRole,'checkbox');assert.equal(tile.props.accessibilityState.checked,true);assert.equal(tile.props.delayLongPress,400);
});

function ortam({rpcError=null,rpcThrow=false,removeError=false,missing=false,swap=false,foreignReply=false}={}){
  const cagrilar=[];let sessionCalls=0;
  const istemci={auth:{getSession:async()=>({data:{session:{user:{id:swap&&++sessionCalls>1?'user-b':'user-a'}}}})},
    rpc:async(name,params)=>{cagrilar.push('rpc');assert.equal(name,'galeri_fotograflarini_sil');if(rpcThrow)throw Error('offline');return{error:rpcError,data:foreignReply?['user-b/ani-a/0.jpg']:params.p_fotograflar.map(f=>f.storage_path)};},
    storage:{from:bucket=>{assert.equal(bucket,'ani-fotograflari');return{
      remove:async paths=>{cagrilar.push('remove');return{error:removeError?{}:null,data:missing?[]:paths.map(name=>({name}))};},
      list:async()=>{cagrilar.push('list');return{data:[],error:null};},
    };}}};
  const h=uiOrtami({'lib/supabase':{supabaseIstemcisiniAl:()=>istemci}});
  return{sil:h.yukle('services/galleryDeleteService').galeriFotograflariniSil,cagrilar};
}
test('Silme servisi kayıtları kaldırdıktan sonra Storage siler; aynı fotoğrafı tek kez gönderir',async()=>{
  const s=ortam();await s.sil('user-a',[foto(0),foto(0),foto(1)]);assert.deepEqual(s.cagrilar,['rpc','remove']);
  const tekrar=ortam({missing:true});await tekrar.sil('user-a',[foto(0)]);assert.deepEqual(tekrar.cagrilar,['rpc','remove','list']);
});
test('Yabancı yol, hesap değişimi, RPC hatası veya belirsiz yanıt Storage silmeye geçemez',async()=>{
  const s=ortam();await assert.rejects(s.sil('user-a',[{...foto(0),fotografYolu:'user-b/ani-a/0.jpg'}]),/eşleşmiyor/);assert.deepEqual(s.cagrilar,[]);
  for(const options of [{rpcError:{code:'42501'}},{rpcThrow:true},{swap:true},{foreignReply:true}]){
    const s=ortam(options);await assert.rejects(s.sil('user-a',[foto(0)]));assert.equal(s.cagrilar.includes('remove'),false);
  }
  const missing=ortam({rpcError:{code:'PGRST202'}});await assert.rejects(missing.sil('user-a',[foto(0)]),/SQL kurulumu/);
});
test('Storage temizliği doğrulanmadan başarı dönmez; kullanıcı aynı seçimle tekrar deneyebilir',async()=>{
  const h=uiOrtami({'lib/supabase':{supabaseIstemcisiniAl:()=>({
    auth:{getSession:async()=>({data:{session:{user:{id:'user-a'}}}})},
    rpc:async()=>({data:[foto(0).fotografYolu],error:null}),
    storage:{from:()=>({remove:async()=>({error:{},data:null}),list:async()=>({data:[{name:'0.jpg'}],error:null})})},
  })}});
  await assert.rejects(h.yukle('services/galleryDeleteService').galeriFotograflariniSil('user-a',[foto(0)]),/tekrar bas/);
});
