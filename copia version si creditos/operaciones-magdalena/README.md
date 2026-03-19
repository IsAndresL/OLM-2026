# Operaciones Logísticas del Magdalena

Sistema de gestión logística para distribución de última milla.

## Estructura del Proyecto

```
operaciones-magdalena/
├── backend/     → API REST (Node.js + Express + Supabase)
├── frontend/    → Interfaz web (React + Vite + Tailwind CSS)
└── supabase_schema.sql → Esquema de base de datos
```

## Stack Tecnológico

- **Frontend**: React 18 + Vite + Tailwind CSS + React Router v6
- **Backend**: Node.js + Express.js (API REST)
- **Base de datos**: Supabase (PostgreSQL + Auth + Storage)
- **Auth**: Supabase Auth + JWT propio firmado en Express

## Requisitos

- Node.js >= 18
- npm >= 9
- Cuenta en Supabase (proyecto configurado)

## Instalación

### 1. Configurar Supabase
1. Crea un proyecto en [Supabase](https://supabase.com)
2. Ve a SQL Editor y ejecuta el contenido de `supabase_schema.sql`
3. Ve a Authentication → Users → Add user para crear el administrador
4. Inserta el perfil del admin en la tabla `usuarios` (ver instrucciones en el SQL)

### 2. Backend
```bash
cd backend
cp .env.example .env
# Edita .env con tus credenciales de Supabase
npm install
npm run dev
```
El servidor arrancará en `http://localhost:4000`

### 3. Frontend
```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```
La aplicación estará en `http://localhost:5173`

## Roles del Sistema

| Rol | Acceso |
|-----|--------|
| `admin` | Panel completo: dashboard, guías, usuarios |
| `empresa` | Dashboard y guías de su empresa |
| `repartidor` | Lista de entregas asignadas |
| `cliente` | Rastreo público de guía (sin login) |

## Fases del Proyecto

- **Fase 1** ✅ Autenticación, roles, estructura base
- **Fase 2** ✅ Gestión de guías y etiquetas PDF
- **Fase 3** ✅ App repartidor y tracking público
- **Fase 4** ✅ Dashboard analítico y reportes

## Deploy a Producción

### Backend en Railway
1. Crear cuenta en railway.app
2. New project → Deploy from GitHub repo
3. Seleccionar carpeta `/backend` como root directory
4. Agregar variables de entorno (copiar de `.env.example` o `.env.production`)
5. El deploy es automático en cada push a main (gracias al `Procfile` incluido)

### Frontend en Vercel
1. Crear cuenta en vercel.com
2. Import project → GitHub repo
3. Root directory: `/frontend`
4. Build command: `npm run build`
5. Output directory: `dist`
6. Agregar variable `VITE_API_URL` con la URL pública generada por Railway (e.g., `https://tu-backend.railway.app/api/v1`)
7. Deploy (el enrutamiento SPA funcionará gracias al archivo `public/_redirects`)

### Variables de entorno requeridas (Backend):
Asegúrate de configurar en Producción:
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `PORT`, `NODE_ENV=production`, `FRONTEND_URL`, `WHAPI_TOKEN`, `WHAPI_URL`.
