import type { FirebaseOptions } from 'firebase/app';

/**
 * Configuración web de Firebase (pública por diseño: la seguridad la dan las reglas de Firestore).
 * Las variables NEXT_PUBLIC_FIREBASE_* tienen prioridad si existen.
 */
const FIXED: FirebaseOptions | null = null;

const fromEnv: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseConfig: FirebaseOptions | null = fromEnv.apiKey && fromEnv.projectId ? fromEnv : FIXED;
