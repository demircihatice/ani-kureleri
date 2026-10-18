const {test}=require('node:test');
const assert=require('node:assert/strict');
const {uiOrtami,nodes}=require('./ui-harness.cjs');
const mid='17000000-0000-4000-8000-000000000010';
const eski=`user-a/17000000-0000-4000-8000-000000000001/0.jpg`;
const tick=()=>new Promise(r=>setImmediate(r));
function ortam({updateError=false,uploadError=false,hesapDegisti=false}={}) {
  const calls=[];let okuma=0;
  const user={id:'user-a',user_metadata:{full_name:'Test Kullanıcı',avatar_path:eski}};
  const h=uiOrtami({
    'services/photoService':{galeridenSec:async(limit)=>{calls.push(['picker',limit]);return[{uri:'local'}];},fotografiHazirla:async(_foto,size)=>{calls.push(['resize',size]);return new ArrayBuffer(4);}},
    'lib/supabase':{supabaseIstemcisiniAl:()=>({
      auth:{getUser:async()=>({data:{user:hesapDegisti && ++okuma>1?{id:'user-b',user_metadata:{}}:user}}),updateUser:async(body)=>{calls.push(['metadata',body]);if(updateError)return{error:new Error('network'),data:{user:null}};Object.assign(user.user_metadata,body.data);return{data:{user}};}},
      storage:{from:()=>({upload:async(path,_bytes,options)=>{calls.push(['upload',path,options]);return{error:uploadError};},remove:async(paths)=>{calls.push(['remove',paths]);return{};},createSignedUrl:async(path,ttl)=>{calls.push(['sign',path,ttl]);return{data:{signedUrl:'private-signed-url'}};}})},
    })},
  });
  return{...h.yukle('services/profilePhotoService'),calls,user};
}

test('Profil fotoğrafı gerçek seçiciyle tek fotoğraf alır; özel yola JPEG yüklenir ve metadata kalıcı güncellenir',async()=>{
  const s=ortam();const foto=await s.profilFotografiSec();const path=await s.profilFotografiniKaydet('user-a',foto);
  assert.equal(s.calls[0][1],1);assert.equal(s.calls[1][1],512);
  assert.ok(s.profilYoluGecerli('user-a',path));
  const upload=s.calls.find(c=>c[0]==='upload');assert.equal(upload[2].upsert,false);assert.equal(upload[2].contentType,'image/jpeg');
  assert.equal(s.user.user_metadata.full_name,'Test Kullanıcı');assert.equal(s.user.user_metadata.avatar_path,path);
  assert.deepEqual(Array.from(s.calls.find(c=>c[0]==='remove')[1]),[eski]);
  assert.equal(await s.guncelProfilFotografi('user-a'),'private-signed-url');
  assert.equal(s.calls.at(-1)[2],600);
});

test('Profil fotoğrafında yabancı yol ve URL imzalanmaz; hesap değişince metadata yazılmaz',async()=>{
  const s=ortam();
  assert.equal(await s.profilFotografiUrl('user-b',eski),null);
  assert.equal(await s.profilFotografiUrl('user-a','https://example.test/private.jpg'),null);
  assert.equal(s.calls.length,0);
  const degisen=ortam({hesapDegisti:true});
  await assert.rejects(degisen.profilFotografiniKaydet('user-a',{uri:'local'}),/Oturum değişti/);
  assert.equal(degisen.calls.some(c=>c[0]==='metadata'),false);
});

test('Yükleme hatasında eski avatar korunur; belirsiz Auth yanıtında yeni dosya silinmez',async()=>{
  const s=ortam({uploadError:true});await assert.rejects(s.profilFotografiniKaydet('user-a',{}));
  assert.equal(s.calls.some(c=>c[0]==='metadata'),false);assert.equal(s.user.user_metadata.avatar_path,eski);
  const belirsiz=ortam({updateError:true});await assert.rejects(belirsiz.profilFotografiniKaydet('user-a',{}),/doğrulanamadı/);
  assert.equal(belirsiz.calls.some(c=>c[0]==='remove'),false);
});

test('Profil fotoğrafı bileşeni seçilen dosyayı kaydeder ve işlem sırasında tekrar seçimi kilitler',async()=>{
  let finish;const calls=[],bekleme=[];
  const h=uiOrtami({
    'hooks/useProfilFotografi':{useProfilFotografi:()=>({url:null,yenile(){}})},
    'services/profilePhotoService':{profilFotografiSec:async()=>({uri:'local'}),profilFotografiniKaydet:(uid,foto)=>{calls.push([uid,foto.uri]);return new Promise(r=>{finish=r;});}},
  });
  let tree=h.mount('components/ProfilFotografi','ProfilFotografi',{kullaniciId:'user-a',ad:'Test',beklemeDegisti:b=>bekleme.push(b)});
  const btn=nodes(tree,n=>n.props?.accessibilityLabel==='Profil fotoğrafını değiştir')[0];
  btn.props.onPress();btn.props.onPress();await tick();tree=h.render();assert.equal(calls.length,1);
  assert.equal(nodes(tree,n=>n.props?.accessibilityLabel==='Profil fotoğrafını değiştir')[0].props.disabled,true);
  finish(`user-a/${mid}/0.jpg`);await tick();h.render();assert.deepEqual(bekleme,[true,false]);
});
