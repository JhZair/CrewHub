# CrewHub+ by KAWSAY — Fase 1

El centro operativo del equipo: publicaciones, casos vivos con Actividad, y seguimiento.
Stack: **Next.js 14 + Supabase** (Postgres, Auth con Google, Realtime) · desplegado en **Vercel**.

---

## Puesta en marcha (una sola vez, ~30 min)

### 1. Base de datos (Supabase)
1. En tu proyecto de Supabase → **SQL Editor** → pega y ejecuta `crewhub-esquema-supabase.sql` (el archivo de diseño; guárdalo también en este repo en `/db`).
2. Verifica en **Table Editor** que existan las tablas (`publicaciones`, `perfiles`, `actividad`, ...).

### 2. Login con Google
1. En [console.cloud.google.com](https://console.cloud.google.com) → tu proyecto → **APIs y servicios → Pantalla de consentimiento OAuth**: tipo *Externo*, nombre "CrewHub+", guarda y **publica** la app.
2. **Credenciales → Crear credenciales → ID de cliente de OAuth → Aplicación web**:
   - URI de redirección autorizada: `https://TU-PROYECTO.supabase.co/auth/v1/callback`
     (el dominio exacto está en Supabase → Project Settings → API → Project URL)
3. Copia el **Client ID** y **Client Secret**.
4. En Supabase → **Authentication → Providers → Google**: actívalo y pega ambos valores.

### 3. Variables de entorno
```bash
cp .env.example .env.local
```
Completa:
- `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` → Supabase → Project Settings → API
- `ALLOWED_EMAILS` → los 6 correos del equipo, separados por coma. **Nadie más podrá entrar aunque tenga Google.**

### 4. Correr en local
```bash
npm install
npm run dev
```
→ http://localhost:3000 · entra con tu Google → tu perfil se crea solo (trigger `crear_perfil`).

### 5. Desplegar en Vercel
1. Sube este código al repo y en [vercel.com](https://vercel.com) → **Add New Project** → importa `JhZair/CrewHub`.
2. En **Environment Variables** agrega las 3 variables del paso 3.
3. Deploy. Copia la URL (ej. `https://crewhub-xxx.vercel.app`).
4. En Supabase → **Authentication → URL Configuration**:
   - Site URL: tu URL de Vercel
   - Redirect URLs: `https://TU-URL.vercel.app/**`

¡Listo! Comparte la URL con el equipo.

---

## Qué incluye la fase 1
- Login con Google restringido por allowlist (`ALLOWED_EMAILS`)
- Feed de publicaciones con tipos (aviso, tarea, problema, pago, idea, archivo)
- Composer para publicar
- Caso vivo: ficha (estado / responsable / prioridad / creado) + **Actividad** (línea de tiempo de eventos + comentarios)
- Cambios de estado auditados automáticamente por los triggers de la base (nada cambia sin dejar rastro)

## Próximas sesiones (hoja de ruta)
1. **Entidades vinculables** en el composer (proyecto, personas, convocatoria, equipamiento, lugar, etiquetas) + importación de catálogos desde Seatable (CSV)
2. **Vistas guardadas** + Mis asuntos + tiempo real (Supabase Realtime)
3. **Qhaway nivel 1**: vencimientos, digest matinal, webhook a Google Chat
4. **Cronogramas** (plantilla Excel → materialización just-in-time) y **Postulaciones** con chequeo de elegibilidad
5. **Modo pantalla** (`/pantalla`) para la TV de la oficina
