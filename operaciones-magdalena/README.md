# Operaciones Logísticas del Magdalena

Sistema de gestión logística de última milla.

## Estructura

```
operaciones-magdalena/
├── backend/      # API Express
├── frontend/     # React + Vite
├── scripts/
├── supabase_schema.sql
└── supabase_gps_realtime_policies.sql
```

## Deploy en Vercel (frontend + backend)

### 1) Preparar base de datos en Supabase

Ejecuta en SQL Editor, en este orden:

1. `supabase_schema.sql`
2. `supabase_gps_realtime_policies.sql`

Luego, en Supabase > Database > Replication, habilita Realtime para:

- `ubicaciones_repartidor`

### 2) Crear usuario administrador

En Supabase Authentication agrega usuario admin, copia su UUID y ejecuta:

```sql
INSERT INTO usuarios (id, nombre_completo, email, rol, empresa_id)
VALUES (
	'UUID-DEL-ADMIN',
	'Administrador Principal',
	'admin@magdalenalogistica.com',
	'admin',
	'00000000-0000-0000-0000-000000000001'
);
```

### 3) Deploy backend en Vercel

1. Vercel > New Project > importar repo
2. Root Directory: `backend`
3. Framework preset: Other
4. Install command: `npm install`
5. Build command: vacío
6. Output directory: vacío
7. Variables de entorno: ver `backend/.env.example`

Al terminar, guarda la URL, por ejemplo:

- `https://tu-backend.vercel.app`

### 4) Deploy frontend en Vercel

1. Crear otro proyecto en Vercel desde el mismo repo
2. Root Directory: `frontend`
3. Framework preset: Vite
4. Build command: `npm run build`
5. Output directory: `dist`
6. Variables de entorno:

- `VITE_API_URL=https://tu-backend.vercel.app/api/v1`
- `VITE_SUPABASE_URL=https://xxxxx.supabase.co`
- `VITE_SUPABASE_ANON_KEY=...`

### 5) Ajustar CORS de backend

En variables del backend Vercel:

- `FRONTEND_URL=https://tu-frontend.vercel.app`

Haz redeploy del backend para aplicar.

## Variables de entorno

### Backend

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JWT_SECRET`
- `NODE_ENV=production`
- `FRONTEND_URL`
- `WHAPI_TOKEN`
- `WHAPI_URL`
- `BASE_URL`

### Frontend

- `VITE_API_URL`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Desarrollo local

### Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

### Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

## Checklist pre-deploy

Desde la raíz:

```bash
npm run check-deploy
```

Si algo falla, el script te indica exactamente qué falta.
