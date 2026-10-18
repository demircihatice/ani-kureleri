const {test}=require('node:test');
const assert=require('node:assert/strict');
const {uiOrtami,nodes,metin}=require('./ui-harness.cjs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const photo=(id,n=0,duygu='joy',uid='user-a')=>({id,baslik:id,tarih:'2026-10-17',duygu,kapak:`https://photo.test/${id}/${n}`,fotografYolu:`${uid}/${id}/${n}.jpg`,fotografSirasi:n});
const sayfa=(anilar,devamVar=false,sonrakiBaslangic=30)=>({anilar,devamVar,sonrakiBaslangic,toplam:40,buAy:1,fotografUyarisi:false});
const detail=(uid,id)=>({duygu:'joy',ani:{id,title:`Başlık ${id}`,memory_date:'2026-10-17',description:`Açıklama ${id}`,
  fotograflar:[{yol:`${uid}/${id}/0.jpg`,url:`https://fresh.test/${id}`}]}});
const button=(tree,label)=>nodes(tree,n=>n.props.accessibilityLabel===label)[0];

test('Galeri kartı seçili filtreyi ve yüklenen gerçek fotoğraf listesini viewer bağlamına aktarır',()=>{
  const h=uiOrtami({'hooks/useGaleri':{useGaleri:(_uid,filter)=>({veri:sayfa(filter==='tumu'?[photo('a'),photo('b',0,'sadness')]:[photo('b',0,'sadness')])})}});
  let tree=h.mount('src/app/galeri');button(tree,'Üzüntü').props.onPress();tree=h.render();
  const grid=nodes(tree,n=>n.type==='FlatList')[0];
  const tile=grid.props.renderItem({item:grid.props.data[0]});tile.props.ac(tile.props.fotograf);
  const nav=h.yollar[0];assert.equal(nav.pathname,'/fotograf/[id]');assert.ok(nav.params.baglam);
  const ctx=h.yukle('lib/galeriViewerBaglami').galeriBaglaminiAl('user-a',nav.params.baglam);
  assert.equal(ctx.filtre,'sadness');assert.deepEqual(Array.from(ctx.sayfa.anilar,p=>p.id),['b']);
});

test('Tümü görünümünde farklı anılar ve çoklu fotoğraflar birlikte gezilir; panel doğru anıyı kullanır',()=>{
  let state,baglam;
  const h=uiOrtami({'hooks/useViewerAnisi':{useViewerAnisi:(uid,id)=>({veri:id?detail(uid,id):null,hata:null,yenile(){}})},
    'all-viewer':{default:()=>{state=h.yukle('hooks/useGaleriViewer').useGaleriViewer('user-a',baglam,'a',0);
      return {type:h.yukle('components/PhotoViewer').PhotoViewer,props:{bilgi:state.bilgi,galeri:state,geri(){},yenile(){}}};}}});
  baglam=h.yukle('lib/galeriViewerBaglami').galeriBaglaminiHazirla('user-a','tumu',sayfa([photo('a'),photo('b'),photo('b',1),photo('c',0,'sadness')]));
  let tree=h.mount('all-viewer');assert.equal(state.fotograflar.length,4);
  const grid=button(tree,'Tam ekran fotoğraflar');grid.props.onMomentumScrollEnd({nativeEvent:{contentOffset:{x:390}}});tree=h.render();
  assert.equal(state.bilgi.ani.id,'b');assert.equal(state.secili,1);
  nodes(tree,n=>n.props.accessibilityLabel==='Tam ekran fotoğraflar')[0].props.onAccessibilityAction({nativeEvent:{actionName:'bilgileriAc'}});tree=h.render();assert.match(metin(tree),/Başlık b/);assert.doesNotMatch(metin(tree),/Başlık a/);
  button(tree,'Anıyı düzenle').props.onPress();assert.equal(h.yollar[0].params.id,'b');assert.equal(h.yollar[0].params.foto,'0');
  h.unmount();
});

test('Duygu görünümü sadece kendi duygu fotoğraflarını alır; başka hesap ve yanlış filtre dışlanır',()=>{
  let state,baglam,uid='user-a';
  const h=uiOrtami({'hooks/useViewerAnisi':{useViewerAnisi:()=>({veri:null,yenile(){}})},
    'filtered-viewer':{default:()=>{state=h.yukle('hooks/useGaleriViewer').useGaleriViewer(uid,baglam,'s1',0);return null;}}});
  const lib=h.yukle('lib/galeriViewerBaglami');
  baglam=lib.galeriBaglaminiHazirla('user-a','sadness',sayfa([photo('s1',0,'sadness'),photo('j1'),photo('s2',0,'sadness'),photo('s3',0,'sadness','user-b')]));
  h.mount('filtered-viewer');assert.deepEqual(Array.from(state.fotograflar,p=>p.aniId),['s1','s2']);
  uid='user-b';h.render();assert.equal(state.gecerli,false);assert.equal(state.fotograflar.length,0);assert.equal(lib.galeriBaglaminiAl('user-b',baglam),null);
  h.unmount();
});

test('Viewer aynı filtre ve anı offsetiyle sonraki sayfayı tek kez yükler; seçili fotoğraf korunur',async()=>{
  let state,baglam,finish;const requests=[];
  const first=Array.from({length:10},(_,i)=>photo(`a${i}`));
  const h=uiOrtami({'hooks/useViewerAnisi':{useViewerAnisi:()=>({veri:null,yenile(){}})},
    'services/galleryService':{galeriyiGetir:(...args)=>{requests.push(args);return new Promise(resolve=>finish=resolve);}},
    'page-viewer':{default:()=>{state=h.yukle('hooks/useGaleriViewer').useGaleriViewer('user-a',baglam,'a0',0);return null;}}});
  baglam=h.yukle('lib/galeriViewerBaglami').galeriBaglaminiHazirla('user-a','joy',sayfa(first,true,30));
  h.mount('page-viewer');assert.equal(requests.length,0,'Tüm galeri açılışta indirilmez');
  state.sec(8);h.render();state.dahaFazla();assert.equal(requests.length,1);
  assert.deepEqual(requests[0].slice(0,3),['user-a','joy',30]);assert.equal(requests[0][5],true);
  finish(sayfa([first[9],photo('next'),photo('wrong',0,'sadness'),photo('foreign',0,'joy','user-b')],false,60));await tick();h.render();
  assert.equal(state.secili,8);assert.equal(state.fotograflar.length,11);assert.equal(state.fotograflar[10].aniId,'next');
  state.sec(10);h.render();assert.equal(state.secili,10);h.unmount();
});

test('Yükleme hatası eski fotoğrafları silmez; unmount geç gelen sayfa sonucunu iptal eder',async()=>{
  let state,baglam,reject,pending;
  const h=uiOrtami({'hooks/useViewerAnisi':{useViewerAnisi:()=>({veri:null,yenile(){}})},
    'services/galleryService':{galeriyiGetir:(_u,_f,_o,signal)=>{pending=signal;return new Promise((_resolve,r)=>reject=r);}},
    'error-viewer':{default:()=>{state=h.yukle('hooks/useGaleriViewer').useGaleriViewer('user-a',baglam,'a0',0);return null;}}});
  baglam=h.yukle('lib/galeriViewerBaglami').galeriBaglaminiHazirla('user-a','tumu',sayfa(Array.from({length:10},(_,i)=>photo(`a${i}`)),true));
  h.mount('error-viewer');state.dahaFazla();reject(Error('offline'));await tick();h.render();assert.equal(state.fotograflar.length,10);assert.match(state.hata,/yüklenemedi/);
  state.dahaFazla();h.unmount();assert.equal(pending.aborted,true);reject(Error('late'));await tick();
});

test('Thumbnail şeridi uzaktaki görünür fotoğrafları da gerçek resimle çizer ve sayfalama ister',()=>{
  let more=0,selected;
  const h=uiOrtami(),fotograflar=Array.from({length:50},(_,i)=>({yol:String(i),url:`https://photo.test/${i}`}));
  const tree=h.mount('components/ThumbnailStrip','ThumbnailStrip',{fotograflar,secili:20,sec:i=>selected=i,dahaFazla:()=>more++});
  assert.equal(tree.type,'FlatList');assert.equal(tree.props.windowSize,1);assert.equal(tree.props.initialScrollIndex,20);
  const tile=tree.props.renderItem({item:fotograflar[35],index:35});assert.equal(tile.props.children.type,'Image');tile.props.onPress();assert.equal(selected,35);
  tree.props.onEndReached();assert.equal(more,1);
});
