# Ronda SUNAT automática (cron semanal)

Verifica el estado SUNAT de todas las empresas activas con RUC y, cuando
detecta un cambio a un estado problemático (no activo / no habido), Bot
Qhaway abre un caso `problema` de prioridad alta vinculado a la empresa y
notifica al equipo. Si la empresa se regulariza, el caso se cierra solo.

## Cómo funciona

- `lib/sunat.ts` — lógica reutilizable (consulta API, actualiza, abre/cierra el problema).
- `app/api/cron/sunat/route.ts` — endpoint que corre la ronda con el bot como autor.
- `vercel.json` — Vercel Cron llama al endpoint **a diario** (08:00 Perú); el código solo ejecuta la ronda **los lunes** (así funciona igual en el plan Hobby, que limita los cron a diarios).

## Variables de entorno (Vercel → Settings → Environment Variables)

| Variable | Para qué | De dónde sale |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Escribir sin sesión de usuario desde el cron | Supabase → Project Settings → API → `service_role` (secreta) |
| `CRON_SECRET` | Que solo Vercel pueda disparar el endpoint | Inventa una cadena larga aleatoria |
| `SUNAT_API_TOKEN` | Consulta de RUC (ya lo tienes) | decolecta / apis.net.pe |

> ⚠️ `SUPABASE_SERVICE_ROLE_KEY` salta el RLS: nunca la expongas en el cliente ni la subas al repo.

Tras agregarlas, Vercel las inyecta al desplegar. El cron aparece en
Vercel → Project → **Cron Jobs**.

## Probar a mano

Con el secreto, forzando la corrida sin esperar al lunes:

```
curl -H "Authorization: Bearer TU_CRON_SECRET" \
  "https://crew-hub-sigma.vercel.app/api/cron/sunat?forzar=1"
```

Responde un JSON con `{ ok, alertas, fallas }`.
