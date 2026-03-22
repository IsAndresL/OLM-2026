// Ejecutar con: node scripts/check-deploy.js
const fs = require('fs');

const checks = [];

function check(nombre, condicion, ayuda) {
  const ok = typeof condicion === 'function' ? condicion() : condicion;
  checks.push({ nombre, ok, ayuda });
}

function readText(path) {
  return fs.existsSync(path) ? fs.readFileSync(path, 'utf8') : '';
}

check(
  'backend/vercel.json existe',
  () => fs.existsSync('backend/vercel.json'),
  'Crear backend/vercel.json con la configuración de serverless'
);

check(
  'frontend/vercel.json existe',
  () => fs.existsSync('frontend/vercel.json'),
  'Crear frontend/vercel.json con rewrites para SPA'
);

check(
  'frontend/public/_redirects existe',
  () => fs.existsSync('frontend/public/_redirects'),
  'Crear con contenido: /*    /index.html   200'
);

check(
  'backend/.env.example existe',
  () => fs.existsSync('backend/.env.example'),
  'Crear backend/.env.example con todas las variables'
);

check(
  'frontend/.env.example existe',
  () => fs.existsSync('frontend/.env.example'),
  'Crear frontend/.env.example con VITE_API_URL, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY'
);

check(
  'backend/.env no commiteado por .gitignore',
  () => readText('.gitignore').includes('*/.env') || readText('.gitignore').includes('.env'),
  'Agregar reglas .env en .gitignore'
);

const pkgBackPath = 'backend/package.json';
const pkgBack = fs.existsSync(pkgBackPath)
  ? JSON.parse(fs.readFileSync(pkgBackPath, 'utf8'))
  : {};

check(
  'backend tiene script start',
  () => Boolean(pkgBack.scripts && pkgBack.scripts.start),
  'Agregar "start": "node src/index.js"'
);

check(
  'nodemon en devDependencies (backend)',
  () => Boolean(pkgBack.devDependencies && pkgBack.devDependencies.nodemon),
  'Mover nodemon a devDependencies'
);

const indexContent = readText('backend/src/index.js');
check(
  'backend exporta app (module.exports = app)',
  () => indexContent.includes('module.exports = app'),
  'Agregar module.exports = app al final de backend/src/index.js'
);

const viteConfig = readText('frontend/vite.config.js');
check(
  'vite.config.js tiene rollupOptions',
  () => viteConfig.includes('rollupOptions'),
  'Actualizar frontend/vite.config.js con manualChunks'
);

const pkgFrontPath = 'frontend/package.json';
const pkgFront = fs.existsSync(pkgFrontPath)
  ? JSON.parse(fs.readFileSync(pkgFrontPath, 'utf8'))
  : {};

check(
  '@supabase/supabase-js en frontend',
  () => Boolean(pkgFront.dependencies && pkgFront.dependencies['@supabase/supabase-js']),
  'Ejecutar npm install @supabase/supabase-js en frontend'
);

check(
  'cliente Supabase frontend creado',
  () => fs.existsSync('frontend/src/config/supabaseClient.js'),
  'Crear frontend/src/config/supabaseClient.js'
);

console.log('\n🔍 Verificación pre-deploy\n');
let fallos = 0;
for (const { nombre, ok, ayuda } of checks) {
  console.log(`${ok ? '✅' : '❌'} ${nombre}`);
  if (!ok) {
    console.log(`   → ${ayuda}`);
    fallos += 1;
  }
}

console.log(`\n${fallos === 0 ? '✅ Todo listo para deploy en Vercel.' : `❌ ${fallos} problema(s) por resolver antes del deploy.`}\n`);
process.exit(fallos > 0 ? 1 : 0);
