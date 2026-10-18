const { test } = require('node:test');
const assert = require('node:assert/strict');
const { uiOrtami, nodes, metin } = require('./ui-harness.cjs');
const button = (tree, name) => nodes(tree, n => n.props?.accessibilityLabel === name)[0];
const style = value => Object.assign({}, ...(Array.isArray(value) ? value.flat(Infinity).filter(Boolean) : [value]));

test('Giriş sonrası ilk korumalı route Galeri; alt menü üç alan ve standart person ikonudur', () => {
  const Stack = Object.assign('Stack', { Protected: 'Protected', Screen: 'Screen' });
  const h = uiOrtami({ 'expo-router': { Stack } });
  const tree = h.mount('src/app/_layout');
  const protectedTree = nodes(tree, n => n.type === 'Protected' && n.props.guard)[0];
  assert.equal(nodes(protectedTree, n => n.type === 'Screen')[0].props.name, 'galeri');
  const nav = uiOrtami().mount('components/ui/AltGezinme', 'AltGezinme', { etkin: '/galeri' });
  assert.deepEqual(nodes(nav, n => n.props?.accessibilityRole === 'tab').map(n => n.props.accessibilityLabel), ['Galeri','Yeni Anı','Profil']);
  assert.equal(nodes(nav, n => n.type === 'Ionicons' && n.props.name === 'person-outline').length, 1);
  assert.doesNotMatch(metin(nav), /Ana Sayfa|Küreler|☺/);
});

test('Katalog tam yedi model sınıfı ve bir fallback; çipler sabit renkte ve okunabilir', () => {
  const h = uiOrtami(), config = h.yukle('constants/duyguSunumu');
  assert.deepEqual(Array.from(config.MODEL_DUYGULARI, e => e.kod), ['anger','shame','joy','disgust','sadness','surprise','fear']);
  const tree = h.mount('components/ui/DuyguSecimi','DuyguFiltreleri',{secili:'alexithymia',sec(){}});
  assert.deepEqual(nodes(tree,n=>n.type==='Pressable').map(n=>n.props.accessibilityLabel), ['Tümü','Öfke','Utanç','Neşe','Tiksinti','Üzüntü','Şaşkınlık','Korku','Aleksitimi']);
  assert.doesNotMatch(metin(tree), /Mutluluk|Hüzün|Sakinlik|Sevgi/);
  const luminance = hex => {
    const rgb = hex.match(/[0-9a-f]{2}/gi).map(c=>parseInt(c,16)/255).map(c=>c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4);
    return rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722;
  };
  for (const e of config.DUYGU_SUNUMU) {
    const chip = button(tree,e.ad);
    assert.equal(style(chip.props.style).backgroundColor,e.zemin);
    const fg=luminance(e.renk),bg=luminance(e.zemin);
    assert.ok((Math.max(fg,bg)+0.05)/(Math.min(fg,bg)+0.05)>=4.5,`${e.ad} kontrast`);
  }
  assert.equal(style(button(tree,'Tümü').props.style).backgroundColor,'#FFFFFF');
  assert.match(metin(button(tree,'Aleksitimi')), /✓/);
});

test('Tümü beyaz zemin; duygu seçimlerinin merkezi renkleri korunur', () => {
  const h=uiOrtami();let tree=h.mount('src/app/galeri');
  assert.equal(nodes(tree,n=>n.props.testID==='emotion-wallpaper').length,0);
  assert.equal(style(nodes(tree,n=>n.props.testID==='galeri-zemini')[0].props.style).backgroundColor,'#FFFFFF');
  const config=h.yukle('constants/duyguSunumu');
  for (const e of config.DUYGU_SUNUMU) {
    button(tree,e.ad).props.onPress();tree=h.render();
    assert.equal(nodes(tree,n=>n.props.testID==='emotion-wallpaper').length,0);
    assert.equal(style(nodes(tree,n=>n.props.testID==='galeri-zemini')[0].props.style).backgroundColor,e.zemin);
  }
  button(tree,'Tümü').props.onPress();tree=h.render();
  assert.equal(nodes(tree,n=>n.props.testID==='emotion-wallpaper').length,0);
  assert.equal(style(nodes(tree,n=>n.props.testID==='galeri-zemini')[0].props.style).backgroundColor,'#FFFFFF');
});

test('Açılış, auth, profil ve diğer ortak sayfalarda zemin beyaz ve gökkuşağı yoktur', () => {
  for(const screen of ['src/app/index','src/app/giris','src/app/kayit','src/app/profil','src/app/yeni-ani','src/app/analiz','src/app/duygu-duzenle']) {
    const tree=uiOrtami().mount(screen);
    assert.equal(nodes(tree,n=>n.props.testID==='emotion-wallpaper').length,0,screen);
    assert.equal(style(nodes(tree,n=>n.type==='SafeAreaView')[0].props.style).backgroundColor,'#FFFFFF',screen);
  }
});

test('Gerçek iki parmak olayları yoğunluğu değiştirir; tek parmak scroll korunur; sınırlar 2–6', () => {
  const h=uiOrtami();let tree=h.mount('src/app/galeri');
  const parent=nodes(tree,n=>n.props.onPanResponderGrant)[0];
  const touch=distance=>({nativeEvent:{touches:[{pageX:0,pageY:0},{pageX:distance,pageY:0}]}});
  assert.equal(parent.props.onMoveShouldSetPanResponderCapture({nativeEvent:{touches:[{}]}}),false);
  assert.equal(parent.props.onMoveShouldSetPanResponderCapture(touch(100)),true);
  parent.props.onPanResponderGrant(touch(100));
  parent.props.onPanResponderMove(touch(70));tree=h.render();
  assert.equal(nodes(tree,n=>n.type==='FlatList')[0].props.numColumns,6);
  parent.props.onPanResponderMove(touch(220));tree=h.render();
  assert.equal(nodes(tree,n=>n.type==='FlatList')[0].props.numColumns,2);
  parent.props.onPanResponderRelease();tree=h.render();
  assert.equal(nodes(tree,n=>n.type==='FlatList')[0].props.scrollEnabled,true);
  assert.equal(button(tree,'Fotoğrafları büyüt'),undefined);
  assert.equal(button(tree,'Fotoğrafları küçült'),undefined);
  assert.doesNotMatch(metin(tree),/\d+\s*sütun/);
  const {pinchSutunu,gridCapasi}=h.yukle('lib/galeriYogunlugu');
  assert.equal(pinchSutunu(5,0.01),6);assert.equal(pinchSutunu(2,100),2);
  assert.equal(pinchSutunu(4,NaN),4);assert.equal(pinchSutunu(4,1.02),4);
  assert.ok(gridCapasi(1200,390,5,3)>0);
});

test('Yoğunluk değişimi gerçek galeri hookunda tekrar veri istemez; fotoğraf ve scroll çapası korunur', async () => {
  const requests=[];
  const h=uiOrtami({'hooks/useGaleri':undefined,'services/galleryService':{galeriyiGetir:async(...args)=>{
    requests.push(args);return{anilar:Array.from({length:100},(_,i)=>({id:String(i),fotografYolu:`${i}.jpg`})),devamVar:false};
  }}});
  h.mount('src/app/galeri');await new Promise(resolve=>setImmediate(resolve));
  let tree=h.render();let grid=nodes(tree,n=>n.type==='FlatList')[0];
  const id=grid.props.keyExtractor(grid.props.data[0],0);
  nodes(tree,n=>n.props.onLayout)[0].props.onLayout({nativeEvent:{layout:{width:390}}});
  grid.props.onScroll({nativeEvent:{contentOffset:{y:1200}}});
  const gesture=nodes(tree,n=>n.props.onPanResponderGrant)[0].props;
  const touch=distance=>({nativeEvent:{touches:[{pageX:0,pageY:0},{pageX:distance,pageY:0}]}});
  gesture.onPanResponderGrant(touch(100));gesture.onPanResponderMove(touch(130));gesture.onPanResponderRelease();
  tree=h.render();grid=nodes(tree,n=>n.type==='FlatList')[0];
  assert.equal(grid.props.numColumns,4);assert.equal(grid.props.keyExtractor(grid.props.data[0],0),id);
  assert.equal(grid.props.getItemLayout(null,10).offset,980,'Sabit satır ölçüsü uzak scroll konumunu da hesaplar');
  let offset;
  grid.props.ref.current={scrollToOffset:arg=>{offset=arg.offset;}};
  grid.props.onContentSizeChange();assert.ok(offset>0,'Remount sonrasında görünür fotoğrafın satırına dönülür');
  assert.equal(requests.length,1,'Yoğunluk değişimi veri sorgusunu veya imzalamayı yeniden başlatmadı');
  h.unmount();
});

test('Fallback sonucu siyah küre/etiket kullanır; model tahmini olarak Aleksitimi kabul edilmez', () => {
  const h=uiOrtami();
  const tree=h.mount('components/AnalizSonucu','AnalizSonucu',{sonuc:{duygu:'alexithymia',baslik:'Test',tarih:'2026-10-17',kapak:null}});
  assert.match(metin(tree),/Aleksitimi/);
  assert.ok(nodes(tree,n=>style(n.props.style).backgroundColor==='#111111').length>0);
  const service=h.yukle('services/analysisService');
  const base={memory_id:'a',status:'completed',version:1,predicted_emotion:{code:'joy'},final_emotion:{code:'alexithymia'},predicted_confidence:0.2,model_version:'unit',analyzed_at:'2026-10-17',final_emotion_source:'fallback'};
  assert.equal(service.analizYanitiniDogrula(base,'a').final_emotion.code,'alexithymia');
  assert.throws(()=>service.analizYanitiniDogrula({...base,predicted_emotion:{code:'alexithymia'}},'a'));
});
