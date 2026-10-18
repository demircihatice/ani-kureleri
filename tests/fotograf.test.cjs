const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');

function ortam({renderHata=false,saveHata=false,okumaHata=false,silmeHata=false,boyut=10}={}) {
  const cagrilar=[];
  const resim={saveAsync:async()=>{if(saveHata)throw new Error('save');return{uri:'file:gecici.jpg'};},release:()=>cagrilar.push('resim.release')};
  const baglam={resize:()=>{},renderAsync:async()=>{if(renderHata)throw new Error('render');return resim;},release:()=>cagrilar.push('baglam.release')};
  const bagimliliklar={
    'expo-image-picker':{},'expo-image-manipulator':{ImageManipulator:{manipulate:()=>baglam},SaveFormat:{JPEG:'jpeg'}},
    'expo-file-system':{File:class {constructor(uri){assert.equal(uri,'file:gecici.jpg');}get exists(){return true;}arrayBuffer(){if(okumaHata)throw new Error('read');return new ArrayBuffer(boyut);}delete(){cagrilar.push('gecici.delete');if(silmeHata)throw new Error('delete');}}},
    'react-native':{Platform:{OS:'android'}},'../constants/ani':{EN_FAZLA_FOTOGRAF:5,EN_FAZLA_FOTOGRAF_BOYUTU:6291456},
  };
  const modul={exports:{}};
  const kod=ts.transpileModule(fs.readFileSync('services/photoService.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(kod,{module:modul,exports:modul.exports,require:(ad)=>bagimliliklar[ad],Error,ArrayBuffer});
  return{...modul.exports,cagrilar};
}
const foto={uri:'file:asil.jpg',width:2000,height:1000};
test('Render başarısız olsa bile native bağlam bırakılır',async()=>{
  const s=ortam({renderHata:true});await assert.rejects(s.fotografiHazirla(foto),/render/);
  assert.deepEqual(s.cagrilar,['baglam.release']);
});
test('JPEG kaydı başarısızsa resim ve bağlam bırakılır',async()=>{
  const s=ortam({saveHata:true});await assert.rejects(s.fotografiHazirla(foto),/save/);
  assert.deepEqual(s.cagrilar,['resim.release','baglam.release']);
});
test('Okuma hatasında geçici dosya temizlenir; iki native kaynak bırakılır',async()=>{
  const s=ortam({okumaHata:true});await assert.rejects(s.fotografiHazirla(foto),/read/);
  assert.deepEqual(s.cagrilar,['gecici.delete','resim.release','baglam.release']);
});
test('Başarılı hazırlamada yalnızca geçici dosya temizlenir; temizleme hatası yüklemeyi bozmaz',async()=>{
  for(const silmeHata of [false,true]) {
    const s=ortam({silmeHata});assert.equal((await s.fotografiHazirla(foto)).byteLength,10);
    assert.deepEqual(s.cagrilar,['gecici.delete','resim.release','baglam.release']);
  }
});
test('Boş veya 6 MB üzerinde hazırlanan fotoğraf reddedilir ve kaynaklar temizlenir',async()=>{
  for(const boyut of [0,6291457]) {
    const s=ortam({boyut});await assert.rejects(s.fotografiHazirla(foto),/6 MB/);
    assert.deepEqual(s.cagrilar,['gecici.delete','resim.release','baglam.release']);
  }
});

test('Fotoğraf seçici kalan kapasiteyi kullanır; geçersiz sınırı veya fazla seçimi reddeder', async () => {
  const { uiOrtami } = require('./ui-harness.cjs');
  const secenekler = [];
  let adet = 2;
  const h = uiOrtami({
    'services/photoService': undefined,
    'expo-image-picker': { launchImageLibraryAsync: async (secenek) => { secenekler.push(secenek); return { canceled: false, assets: Array.from({ length: adet }, (_, i) => ({ uri: `file:${i}.jpg`, width: 20, height: 20 })) }; } },
    'expo-image-manipulator': {}, 'expo-file-system': {},
  });
  const servis = h.yukle('services/photoService');
  assert.equal((await servis.galeridenSec(2)).length, 2);
  assert.equal(secenekler[0].selectionLimit, 2);
  adet = 3; await assert.rejects(servis.galeridenSec(2));
  const once = secenekler.length;
  for (const kalan of [0, -1, 6, 1.5]) await assert.rejects(servis.galeridenSec(kalan));
  assert.equal(secenekler.length, once);
});
