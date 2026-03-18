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
- **Fase 2** 🔜 Gestión de guías y etiquetas PDF
- **Fase 3** 🔜 App repartidor y tracking público
- **Fase 4** 🔜 Dashboard analítico y reportes
