import type { FirebaseOptions } from 'firebase/app';

/**
 * Configuración web de Firebase (pública por diseño: la seguridad la dan las reglas de Firestore).
 * Las variables NEXT_PUBLIC_FIREBASE_* tienen prioridad si existen.
 */
const FIXED: FirebaseOptions | null = {
  apiKey: 'AIzaSyD3vITy6p5gMwzMFHC0LelHbb_dqyytBK4',
  authDomain: 'timeflow-f5a5e.firebaseapp.com',
  projectId: 'timeflow-f5a5e',
  storageBucket: 'timeflow-f5a5e.firebasestorage.app',
  messagingSenderId: '652743995182',
  appId: '1:652743995182:web:c42a95151ca7455f3194bf',
};

const fromEnv: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseConfig: FirebaseOptions | null = fromEnv.apiKey && fromEnv.projectId ? fromEnv : FIXED;
