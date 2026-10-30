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

## Sincronización (Firebase)

1. Firebase › Authentication › habilitar **Correo electrónico/contraseña**.
2. Firestore › crear base de datos › pestaña **Reglas** › pegar `firestore.rules` › Publicar.
3. Configuración web en `src/data/firebase-config.ts` (o variables `NEXT_PUBLIC_FIREBASE_*`).
4. En la app: Configuración › Datos › Sincronización › Crear cuenta / Entrar.

Sin configuración la app funciona solo en local.
