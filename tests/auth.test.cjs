const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { createClient } = require('@supabase/supabase-js');

// React Native bağımlılıklarını yüklemeden gerçek servis kodunu sınar.
function yukle(dosya, bagimliliklar = {}) {
  const kaynak = fs.readFileSync(dosya, 'utf8');
  const kod = ts.transpileModule(kaynak, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const modul = { exports: {} };
  vm.runInNewContext(kod, {
    module: modul, exports: modul.exports, Error, TypeError,
    require: (ad) => {
      if (!(ad in bagimliliklar)) throw new Error(`Beklenmeyen bağımlılık: ${ad}`);
      return bagimliliklar[ad];
    },
  });
  return modul.exports;
}

const dogrulama = yukle('lib/authDogrulama.ts');
test('Hatalı e-posta, boş şifre ve kısa kayıt şifresi reddedilir', () => {
  assert.ok(dogrulama.girisBilgileriniDogrula({ eposta: 'yanlis', sifre: '123' }));
  assert.ok(dogrulama.girisBilgileriniDogrula({ eposta: 'test@example.com', sifre: '' }));
  assert.ok(dogrulama.kayitBilgileriniDogrula({ adSoyad: 'Test Kullanıcısı', eposta: 'test@example.com', sifre: '1234567' }));
  assert.equal(dogrulama.kayitBilgileriniDogrula({ adSoyad: 'Test Kullanıcısı', eposta: ' test@example.com ', sifre: 'uzun-sifre' }), null);
  // Eski bir hesabın kısa şifresi girişte engellenmemeli.
  assert.equal(dogrulama.girisBilgileriniDogrula({ eposta: 'test@example.com', sifre: '123456' }), null);
});

test('Doğrulanmamış hesap, hatalı şifre ve ağ sorunu Türkçe açıklanır', () => {
  assert.match(dogrulama.authHataMesaji({ code: 'email_not_confirmed' }), /doğrulama/);
  assert.match(dogrulama.authHataMesaji({ code: 'invalid_credentials' }), /hatalı/);
  assert.match(dogrulama.authHataMesaji(new TypeError('Failed to fetch')), /İnternet/);
  assert.ok(!dogrulama.authHataMesaji(new Error('secret-token')).includes('secret-token'));
});

test('Kayıt sadece Auth metadata kullanır; doğrulama açık/kapalı yanıtlarını ayırır', async () => {
  let aktifOturum = null;
  let istek;
  const servis = yukle('services/authService.ts', {
    '../lib/supabase': { supabaseIstemcisiniAl: () => ({ auth: {
      signUp: async (girdi) => { istek = girdi; return { data: { session: aktifOturum }, error: null }; },
    } }) },
  });
  const bilgiler = { adSoyad: '  Test Adı  ', eposta: ' test@example.com ', sifre: ' sifre-korunur ' };
  assert.equal((await servis.kayitOl(bilgiler)).dogrulamaGerekli, true);
  assert.equal(istek.options.data.full_name, 'Test Adı');
  assert.equal(istek.email, 'test@example.com');
  assert.equal(istek.password, bilgiler.sifre);
  aktifOturum = { user: { id: 'test' } };
  assert.equal((await servis.kayitOl(bilgiler)).dogrulamaGerekli, false);
});

test('Giriş ve çıkış hataları yutulmaz; çıkış sadece yerel oturumu kapatır', async () => {
  const sorun = { code: 'invalid_credentials' };
  let kapsam;
  const servis = yukle('services/authService.ts', {
    '../lib/supabase': { supabaseIstemcisiniAl: () => ({ auth: {
      signInWithPassword: async () => ({ error: sorun }),
      signOut: async (secenek) => { kapsam = secenek.scope; return { error: sorun }; },
    } }) },
  });
  await assert.rejects(servis.girisYap({ eposta: 'a@b.com', sifre: 'sifre' }), (hata) => hata === sorun);
  await assert.rejects(servis.cikisYap(), (hata) => hata === sorun);
  assert.equal(kapsam, 'local');
});

test('SDK oturumu saklar, yeni istemcide geri yükler ve çıkışta temizler (sahte HTTP)', async () => {
  const depo = new Map();
  const storage = {
    getItem: async (ad) => depo.get(ad) ?? null,
    setItem: async (ad, deger) => { depo.set(ad, deger); },
    removeItem: async (ad) => { depo.delete(ad); },
  };
  const kullanici = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', email: 'test@example.com', user_metadata: { full_name: 'Test Adı' } };
  const token = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: kullanici.id, exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url')}.test`;
  const fetch = async (url) => String(url).includes('/logout')
    ? new Response(null, { status: 204 })
    : new Response(JSON.stringify({ access_token: token, refresh_token: 'sahte-refresh', expires_in: 3600, token_type: 'bearer', user: kullanici }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const olustur = () => createClient('https://auth-test.invalid', 'sb_publishable_test', {
    auth: { storage, storageKey: 'test-oturum', persistSession: true, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch },
  });
  const ilk = olustur();
  const giris = await ilk.auth.signInWithPassword({ email: kullanici.email, password: 'test-only' });
  assert.equal(giris.error, null);
  assert.ok(depo.has('test-oturum'));
  const ikinci = olustur();
  assert.equal((await ikinci.auth.getSession()).data.session.user.id, kullanici.id);
  assert.equal((await ikinci.auth.signOut({ scope: 'local' })).error, null);
  assert.equal((await ikinci.auth.getSession()).data.session, null);
  assert.equal(depo.has('test-oturum'), false);
});
