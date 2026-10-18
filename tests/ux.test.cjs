const { test } = require('node:test');
const assert = require('node:assert/strict');
const { uiOrtami, nodes, metin } = require('./ui-harness.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const button = (tree, label) => nodes(tree,n=>n.props?.accessibilityLabel===label)[0];
const thumbnail = (tree, index) => {
  const strip = button(tree, 'Fotoğraf küçük resimleri');
  return strip.props.renderItem({ item: strip.props.data[index], index });
};
const bilgi = (uid='user-a',id='ani-a') => ({ duygu:'joy',ani:{id,title:'Yaz akşamı',description:'Birlikte güzel bir gün.',memory_date:'2026-10-01',sphere_id:null,
  fotograflar:[0,1,2,3,4].map(i=>({yol:`${uid}/${id}/${i}.jpg`,url:`https://photo.test/${i}`}))} });

test('Yeni anı tarihi yerel günle doğrulanır: bugün kabul, gelecek ve geçersiz gün reddedilir',()=>{
  const {yeniAniTarihiniDogrula,yerelTarih}=uiOrtami().yukle('lib/aniDogrulama');
  const today=new Date(2026,9,17,0,1);
  assert.equal(yeniAniTarihiniDogrula('2026-10-17',today),null);
  assert.match(yeniAniTarihiniDogrula('2026-10-18',today),/bugünden sonra/);
  assert.match(yeniAniTarihiniDogrula('2026-02-30',today),/Geçerli/);
  const local={getFullYear:()=>2026,getMonth:()=>9,getDate:()=>17,toISOString:()=>{throw Error('UTC kullanılmamalı');}};
  assert.equal(yerelTarih(local),'2026-10-17');assert.equal(yeniAniTarihiniDogrula('2026-10-17',local),null);
});

test('Native ve web seçiciler maximumDate/max uygular; gelecekteki olay da callbacke gitmez',()=>{
  const h=uiOrtami(), secimler=[];
  let tree=h.mount('components/AniTarihi','AniTarihi',{deger:'2026-10-17',enGec:'2026-10-17',devreDisi:false,degistir:d=>secimler.push(d)});
  nodes(tree,n=>n.type==='Pressable')[0].props.onPress();tree=h.render();
  const picker=nodes(tree,n=>n.type==='DateTimePicker')[0];
  assert.equal(picker.props.maximumDate.getDate(),17);
  picker.props.onChange({type:'set'},new Date(2026,9,18));assert.equal(secimler.length,0);
  picker.props.onChange({type:'set'},new Date(2026,9,17));assert.deepEqual(secimler,['2026-10-17']);
  tree=h.mount('components/AniTarihi.web','AniTarihi',{deger:'2026-10-17',enGec:'2026-10-17',devreDisi:false,degistir:d=>secimler.push(d)});
  assert.equal(tree.type,'input');assert.equal(tree.props.type,'date');assert.equal(tree.props.max,'2026-10-17');
  tree.props.onChange({target:{value:'2026-10-18'}});assert.equal(secimler.length,1);
});

test('Yeni Anı sade görünür; seçici aşılsa bile form ve servis gelecek tarihi reddeder',async()=>{
  const h=uiOrtami({'components/AniTarihi':{AniTarihi:'DateControl'},'constants/api':{memoryApiEtkin:()=>true}});
  let tree=h.mount('src/app/yeni-ani');
  assert.doesNotMatch(metin(tree),/İlk fotoğraf kapak|Duygu Tahmini|dokuttuktan/);assert.match(metin(tree),/0\s*\/5 fotoğraf/);
  const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);
  const date=h.yukle('lib/aniDogrulama').yerelTarih(tomorrow);
  button(tree,'Fotoğraf Ekle').props.onPress();await tick();tree=h.render();
  button(tree,'Anı başlığı').props.onChangeText('Test');
  nodes(tree,n=>n.type==='DateControl')[0].props.degistir(date);
  tree=h.render();button(tree,'Ana Küre ile Analiz Et').props.onPress();tree=h.render();
  assert.match(metin(tree),/bugünden sonra/);assert.deepEqual(h.yollar,[]);
  const service=h.yukle('services/newMemoryService');
  await assert.rejects(service.analizIcinAniOlustur({form:{tarih:date}},()=>{}),/bugünden sonra/);
});

test('Anı düzenleme seçicisi bugünü sınır alır; doğrudan gelecek tarih gönderilirse servis çağrılmaz',async()=>{
  let cagrilar=0;
  const h=uiOrtami({'components/AniTarihi':{AniTarihi:'DateControl'},
    'services/galleryDetailService':{galeriBilgileriniGuncelle:async()=>{cagrilar++;}}});
  let tree=h.mount('components/AniDuzenlemeFormu','AniDuzenlemeFormu',{
    ani:bilgi().ani,kullaniciId:'user-a',tamamlandi(){throw Error('Kaydedilmemeli');},vazgec(){}});
  const {yerelTarih}=h.yukle('lib/aniDogrulama');
  const picker=nodes(tree,n=>n.type==='DateControl')[0];
  assert.equal(picker.props.enGec,yerelTarih(new Date()));
  const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);
  picker.props.degistir(yerelTarih(tomorrow));tree=h.render();
  button(tree,'Değişiklikleri kaydet').props.onPress();await tick();tree=h.render();
  assert.match(metin(tree),/bugünden sonra/);assert.equal(cagrilar,0);
});

test('API ve Supabase düzenleme servisleri gelecek tarihi ağ isteği yapmadan reddeder',async()=>{
  const h=uiOrtami({'services/memoryService':undefined});
  const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);
  const form={baslik:'Test',aciklama:'',tarih:h.yukle('lib/aniDogrulama').yerelTarih(tomorrow)};
  await assert.rejects(h.yukle('services/memoryService').aniBilgileriniGuncelle('user-a','ani-a',form),/bugünden sonra/);
  await assert.rejects(h.yukle('services/apiMemoryService').apiAniBilgileriniGuncelle('ani-a',form,1),/bugünden sonra/);
});

test('Açılış, giriş ve kayıt slogan içermez; açılışta yalnız logo/marka ve auth düğmeleri kalır',()=>{
  for(const route of ['src/app/index','src/app/giris','src/app/kayit']){
    const tree=uiOrtami().mount(route);
    assert.doesNotMatch(metin(tree),/Anıların hep seninle|Bir fotoğraf, bin his/);
    assert.match(metin(tree),/Anı Küresi/);
  }
  const tree=uiOrtami().mount('src/app/index');assert.ok(button(tree,'Giriş Yap'));assert.ok(button(tree,'Kayıt Ol'));
});

test('Giriş şifre gözü çalışır; kayıt şifre/tekrar gözleri bağımsız ve değerler korunur',()=>{
  for(const kayit of [false,true]){
    const h=uiOrtami();let tree=h.mount('components/AuthFormu','AuthFormu',{kayit});
    assert.equal(button(tree,'Şifre').props.secureTextEntry,true);
    button(tree,'Şifre').props.onChangeText('password123');tree=h.render();
    button(tree,'Şifre: Girilen şifreyi göster').props.onPress();tree=h.render();
    assert.equal(button(tree,'Şifre').props.secureTextEntry,false);assert.equal(button(tree,'Şifre').props.value,'password123');
    if(kayit){
      assert.equal(button(tree,'Şifre Tekrar').props.secureTextEntry,true);
      button(tree,'Şifre Tekrar: Girilen şifreyi göster').props.onPress();tree=h.render();
      assert.equal(button(tree,'Şifre Tekrar').props.secureTextEntry,false);
    }
    button(tree,'Şifre: Girilen şifreyi gizle').props.onPress();tree=h.render();
    assert.equal(button(tree,'Şifre').props.secureTextEntry,true);
    if(kayit)assert.equal(button(tree,'Şifre Tekrar').props.secureTextEntry,false);
  }
});

test('Avatarın tek seçme eylemi köşe kalemidir; büyük fotoğraf düğmesi kaldırılmıştır',()=>{
  const h=uiOrtami({'hooks/useProfilFotografi':{useProfilFotografi:()=>({url:null,yenile(){}})}});
  const tree=h.mount('components/ProfilFotografi','ProfilFotografi',{kullaniciId:'user-a',ad:'Test',beklemeDegisti(){}});
  assert.ok(button(tree,'Profil fotoğrafını değiştir'));
  assert.equal(nodes(tree,n=>n.type==='Ionicons'&&n.props.name==='pencil').length,1);
  assert.equal(nodes(tree,n=>n.type==='Pressable').length,1);
  assert.doesNotMatch(metin(tree),/Fotoğraf Seç|Fotoğrafı Değiştir/);
});

test('Galeri fotoğrafı tam ekran routea seçilen fotoğraf sırasını taşır',()=>{
  const h=uiOrtami();const tree=h.mount('components/FotografGaleriEkrani','FotografKaresi',{fotograf:{id:'ani-a',baslik:'Test',fotografSirasi:2,kapak:null}});
  nodes(tree,n=>n.type==='Pressable')[0].props.onPress();
  assert.equal(h.yollar[0].pathname,'/fotograf/[id]');assert.equal(h.yollar[0].params.foto,'2');
});

test('Viewer yatay swipe ve thumbnail seçimini aynı aktif fotoğrafta tutar; tam boy resimler sınırlıdır',()=>{
  const h=uiOrtami();let tree=h.mount('components/PhotoViewer','PhotoViewer',{bilgi:bilgi(),ilkFoto:1,geri(){},yenile(){}});
  assert.doesNotMatch(metin(tree),/Yaz akşamı|Birlikte güzel|Neşe/);
  let grid=nodes(tree,n=>n.type==='FlatList')[0];assert.equal(grid.props.initialScrollIndex,1);assert.equal(grid.props.windowSize,3);
  assert.ok(grid.props.renderItem({item:bilgi().ani.fotograflar[1],index:1}).props.style.height>0,'Tam boy alan yüzde yüksekliğiyle çökmemeli');
  assert.equal(button(tree,'Fotoğraf küçük resimleri').props.windowSize,1,'Küçük resimler görünür pencereyle sınırlı render edilir');
  assert.equal(grid.props.renderItem({item:bilgi().ani.fotograflar[4],index:4}).props.children,false);
  grid.props.onMomentumScrollEnd({nativeEvent:{contentOffset:{x:390*2}}});tree=h.render();
  assert.equal(thumbnail(tree,2).props.accessibilityState.selected,true);
  const strip=button(tree,'Fotoğraf küçük resimleri');let scroll;
  strip.props.ref.current={scrollToIndex:arg=>{scroll=arg;}};
  thumbnail(tree,4).props.onPress();tree=h.render();
  assert.equal(thumbnail(tree,4).props.accessibilityState.selected,true);assert.equal(scroll.index,4);
  assert.equal(button(tree,'Önceki fotoğraf'),undefined);assert.equal(button(tree,'Sonraki fotoğraf'),undefined);
  assert.equal(button(tree,'Fotoğrafları yenile'),undefined);assert.equal(button(tree,'Fotoğraf bilgilerini aç'),undefined);
  assert.doesNotMatch(metin(tree),/\d+ \/ \d+/);
});

test('Dikey swipe-up bilgi panelini açar, yatay hareket açmaz; swipe-down ve geri kapatır',()=>{
  const h=uiOrtami();let exits=0;
  let tree=h.mount('components/PhotoViewer','PhotoViewer',{bilgi:bilgi(),geri(){exits++;},yenile(){}});
  const parent=nodes(tree,n=>n.props.onPanResponderGrant)[0],p=parent.props;
  assert.equal(p.onMoveShouldSetPanResponderCapture(null,{dx:120,dy:-20,numberActiveTouches:1}),false);
  assert.equal(p.onMoveShouldSetPanResponderCapture(null,{dx:0,dy:-120,numberActiveTouches:2}),false);
  assert.equal(p.onMoveShouldSetPanResponderCapture(null,{dx:0,dy:-120,numberActiveTouches:1}),true);
  p.onPanResponderGrant();p.onPanResponderMove(null,{dy:-120});p.onPanResponderRelease(null,{dy:-120});tree=h.render();
  assert.match(metin(tree),/Yaz akşamı/);assert.match(metin(tree),/Birlikte güzel bir gün/);assert.match(metin(tree),/Ekim/);
  assert.doesNotMatch(metin(tree),/Fotoğraf bilgileri|Neşe/);
  assert.ok(nodes(tree,n=>n.props.accessibilityViewIsModal && n.props.style.backgroundColor==='#FDD835').length);
  assert.ok(button(tree,'Anıyı düzenle'));
  p.onPanResponderGrant();p.onPanResponderMove(null,{dy:100});p.onPanResponderRelease(null,{dy:100});tree=h.render();assert.doesNotMatch(metin(tree),/Yaz akşamı/);
  nodes(tree,n=>n.props.accessibilityLabel==='Tam ekran fotoğraflar')[0].props.onAccessibilityAction({nativeEvent:{actionName:'bilgileriAc'}});tree=h.render();button(tree,'Galeriye dön').props.onPress();tree=h.render();
  assert.doesNotMatch(metin(tree),/Yaz akşamı/);assert.equal(exits,0);
  button(tree,'Galeriye dön').props.onPress();assert.equal(exits,1);
});

test('Bilgi panelinden mevcut düzenleme routeuna gidilir; sahte paylaş/sil/indir yoktur',()=>{
  const h=uiOrtami();let tree=h.mount('components/PhotoViewer','PhotoViewer',{bilgi:bilgi(),ilkFoto:2,geri(){},yenile(){}});
  nodes(tree,n=>n.props.accessibilityLabel==='Tam ekran fotoğraflar')[0].props.onAccessibilityAction({nativeEvent:{actionName:'bilgileriAc'}});tree=h.render();button(tree,'Anıyı düzenle').props.onPress();
  assert.equal(h.yollar[0].pathname,'/ani/[id]');assert.equal(h.yollar[0].params.duzenle,'1');assert.equal(h.yollar[0].params.foto,'2');
  assert.doesNotMatch(metin(tree),/Paylaş|Sil|İndir/);
});

test('Viewer düzenleme bağlantısı mevcut anı formunu doğrudan açar',async()=>{
  const h=uiOrtami();h.mount('src/app/ani/[id]','AniEkrani',{kullaniciId:'user-a',id:'ani-a',ilkDuzenle:true});
  await tick();const tree=h.render();
  assert.ok(button(tree,'Anı başlığını düzenle'));assert.ok(button(tree,'Değişiklikleri kaydet'));assert.ok(button(tree,'Vazgeç'));
});

test('Viewer düzenlemesinden vazgeçmek fotoğrafa, kaydetmek güncellenmiş bilgi paneline döner',async()=>{
  for(const kaydet of [false,true]){
    let editor=null,geri=0,yenileme=0,veri=bilgi();
    const h=uiOrtami({
      'expo-router':{router:{push(nav){editor=nav.params;},canGoBack:()=>true,back(){geri++;editor=null;},replace(){throw Error('Eski sayfaya gidilmemeli');}},useFocusEffect:fn=>h.yukle('react').useEffect(fn,[fn])},
      'components/AniDuzenlemeFormu':{AniDuzenlemeFormu:'EditForm'},
      'services/galleryDetailService':{galeriDetayiniGetir:async()=>veri},
      'edit-return-test':{default:()=>({type:'View',props:{children:[
        {type:h.yukle('components/PhotoViewer').PhotoViewer,props:{bilgi:veri,ilkFoto:2,geri(){},yenile(){yenileme++;}}},
        editor?{type:h.yukle('src/app/ani/[id]').AniEkrani,props:{kullaniciId:'user-a',id:editor.id,ilkFoto:2,ilkDuzenle:true,donus:editor.donus}}:null,
      ]}})},
    });
    let tree=h.mount('edit-return-test');
    button(tree,'Tam ekran fotoğraflar').props.onAccessibilityAction({nativeEvent:{actionName:'bilgileriAc'}});tree=h.render();
    button(tree,'Anıyı düzenle').props.onPress();tree=h.render();await tick();tree=h.render();
    const form=nodes(tree,n=>n.type==='EditForm')[0];assert.ok(form);assert.ok(editor.donus);
    if(kaydet){veri={...veri,ani:{...veri.ani,title:'Yeni başlık'}};form.props.tamamlandi(veri.ani);}else form.props.vazgec();
    h.render();tree=h.render();
    assert.equal(geri,1);assert.equal(editor,null);assert.equal(thumbnail(tree,2).props.accessibilityState.selected,true);
    assert.equal(yenileme,kaydet?1:0);
    assert.equal(!!button(tree,'Anıyı düzenle'),kaydet);
    if(kaydet)assert.match(metin(tree),/Yeni başlık/);
    assert.doesNotMatch(metin(tree),/Tam ekran görüntüle|Sil · Yakında|Fotoğrafları ve bilgileri yenile/);
    h.unmount();
  }
});

test('Düzenleme dönüşü başka kullanıcı/anı tarafından tetiklenemez; tek seferliktir ve temizlenir',()=>{
  const h=uiOrtami();const lib=h.yukle('lib/aniDuzenlemeDonusu');let cagrilar=0;
  const donus=lib.duzenlemeDonusunuHazirla('user-a','ani-a',()=>cagrilar++);
  lib.duzenlemeDonusunuBildir(donus.kimlik,'user-b','ani-a',true);
  lib.duzenlemeDonusunuBildir(donus.kimlik,'user-a','ani-b',true);assert.equal(cagrilar,0);
  lib.duzenlemeDonusunuBildir(donus.kimlik,'user-a','ani-a',true);
  lib.duzenlemeDonusunuBildir(donus.kimlik,'user-a','ani-a',true);assert.equal(cagrilar,1);
  const ikinci=lib.duzenlemeDonusunuHazirla('user-a','ani-a',()=>cagrilar++);ikinci.temizle();
  lib.duzenlemeDonusunuBildir(ikinci.kimlik,'user-a','ani-a',true);assert.equal(cagrilar,1);
});

test('Viewer hesap değişiminde eski sonucu gizler ve geç yanıtı reddeder; yabancı yol kabul edilmez',async()=>{
  let uid='user-a',state;const requests=[];
  const h=uiOrtami({'services/galleryDetailService':{galeriDetayiniGetir:(u,id,signal)=>new Promise(resolve=>requests.push({u,id,signal,resolve}))},
    'test-viewer':{default:()=>{state=h.yukle('hooks/useViewerAnisi').useViewerAnisi(uid,'ani-a');return null;}}});
  h.mount('test-viewer');requests[0].resolve(bilgi());await tick();h.render();assert.ok(state.veri);
  uid='user-b';h.render();assert.equal(state.veri,null);assert.equal(requests[0].signal.aborted,true);
  requests[1].resolve(bilgi('user-a'));await tick();h.render();assert.equal(state.veri,null);assert.match(state.hata,/açılamadı/);
  state.yenile();h.render();const pending=requests.at(-1);h.unmount();assert.equal(pending.signal.aborted,true);
  pending.resolve(bilgi('user-b'));await tick();
});

test('Viewer imzaları zamanında ve foregroundda yeniler; arka plan/unmount timerı temizler',async()=>{
  let changed,state,requestCount=0;const timers=[];
  const h=uiOrtami({'react-native':{AppState:{addEventListener:(_,fn)=>{changed=fn;return{remove(){}};}}},
    'services/galleryDetailService':{galeriDetayiniGetir:async()=>{requestCount++;return bilgi();}},
    'timer-viewer':{default:()=>{state=h.yukle('hooks/useViewerAnisi').useViewerAnisi('user-a','ani-a');return null;}}},
    {setTimeout:(fn,ms)=>{const timer={fn,ms};timers.push(timer);return timer;},clearTimeout:t=>{if(t)t.cancelled=true;}});
  h.mount('timer-viewer');await tick();h.render();assert.ok(state.veri);assert.equal(timers[0].ms,480000);
  timers[0].fn();await tick();assert.equal(requestCount,2);
  changed('background');assert.equal(timers.at(-1).cancelled,true);
  changed('active');await tick();assert.equal(requestCount,3);
  h.unmount();assert.equal(timers.at(-1).cancelled,true);
});
