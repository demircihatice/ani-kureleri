// Tek süreç; Windows'ta node --test alt süreç izinlerine ihtiyaç duymaz.
const dosyalar=process.argv.includes('--rls')
  ? ['rls.mjs','baslangic.mjs','fotograf-rls.mjs','izolasyon.mjs']
  : ['auth.test.cjs','kureler.test.cjs','ani.test.cjs','ani-liste.test.cjs','ani-detay.test.cjs','fotograf.test.cjs'];
for(const dosya of dosyalar)await import(new URL(`../tests/${dosya}`,import.meta.url));
