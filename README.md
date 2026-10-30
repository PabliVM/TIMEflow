# TIMEFLOW

PWA mobile-first para registrar y analizar tu tiempo. Datos locales en IndexedDB.

```bash
npm install
npm run dev        # desarrollo: http://localhost:3000
npm run build && npm start   # producción (PWA + offline)
npm test           # reglas de dominio
npm run preview    # HTML autocontenido en preview/timeflow.html
```

Capas: `src/domain` (reglas puras) · `src/data` (interfaz `Repository` + IndexedDB) · `src/state` (store React) · `src/ui` (pantallas).
Para sincronizar en el futuro, implementar `Repository` con un backend remoto.

## Sincronización (Supabase)

1. Vercel › proyecto › Storage › Create › **Supabase** (añade `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
2. Supabase › SQL Editor › pegar `supabase/schema.sql` › Run.
3. Redeploy en Vercel.
4. En la app: Configuración › Datos › Sincronización › Crear cuenta / Entrar.

Sin esas variables la app funciona solo en local.
