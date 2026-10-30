import type { FirebaseOptions } from 'firebase/app';
import { getApps, initializeApp } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { collection, doc, getDocs, getFirestore, limit, orderBy, query, serverTimestamp, startAfter, Timestamp, where, writeBatch } from 'firebase/firestore';
import type { QueryConstraint, QueryDocumentSnapshot } from 'firebase/firestore';
import type { RemoteRow } from './merge';
import type { RemoteBackend, RemoteUser } from './sync';

const toUser = (u: User | null): RemoteUser | null => (u ? { id: u.uid, email: u.email } : null);

const encode = (t: Timestamp) => `${t.seconds}.${String(t.nanoseconds).padStart(9, '0')}`;
const decode = (c: string) => {
  const [s, n] = c.split('.');
  return new Timestamp(Number(s), Number(n));
};

const MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'Email o contraseña incorrectos.',
  'auth/wrong-password': 'Email o contraseña incorrectos.',
  'auth/user-not-found': 'Email o contraseña incorrectos.',
  'auth/invalid-email': 'El email no es válido.',
  'auth/email-already-in-use': 'Ya existe una cuenta con ese email. Pulsa Entrar.',
  'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
  'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos.',
  'auth/network-request-failed': 'Sin conexión.',
  'auth/operation-not-allowed': 'Activa "Correo electrónico/contraseña" en Firebase › Authentication.',
  'permission-denied': 'Firestore ha denegado el acceso: revisa las reglas (firestore.rules).',
};

function friendly(e: unknown): Error {
  const code = (e as { code?: string })?.code ?? '';
  return new Error(MESSAGES[code] ?? (e instanceof Error ? e.message : String(e)));
}

/**
 * Firestore: users/{uid}/records/{store}__{id} = { store, id, json, deleted, updatedAt }.
 * El contenido va serializado en `json` para no depender de las limitaciones de tipos de Firestore.
 */
export function createFirebaseBackend(config: FirebaseOptions): RemoteBackend {
  const app = getApps()[0] ?? initializeApp(config);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const records = (uid: string) => collection(db, 'users', uid, 'records');

  return {
    async currentUser() {
      await auth.authStateReady();
      return toUser(auth.currentUser);
    },
    onUserChange(cb) {
      onAuthStateChanged(auth, (u) => cb(toUser(u)));
    },
    async signIn(email, password) {
      try {
        await signInWithEmailAndPassword(auth, email, password);
      } catch (e) {
        throw friendly(e);
      }
    },
    async signUp(email, password) {
      try {
        await createUserWithEmailAndPassword(auth, email, password);
      } catch (e) {
        throw friendly(e);
      }
    },
    async signOut() {
      await signOut(auth);
    },
    async fetch(uid, since) {
      const out: RemoteRow[] = [];
      let last: QueryDocumentSnapshot | undefined;
      try {
        for (;;) {
          const c: QueryConstraint[] = [];
          if (since) c.push(where('updatedAt', '>', decode(since)));
          c.push(orderBy('updatedAt'));
          if (last) c.push(startAfter(last));
          c.push(limit(500));
          const snap = await getDocs(query(records(uid), ...c));
          for (const d of snap.docs) {
            const v = d.data();
            if (!v.updatedAt) continue;
            out.push({ store: v.store, id: v.id, data: v.json ? JSON.parse(v.json) : null, deleted: !!v.deleted, cursor: encode(v.updatedAt as Timestamp) });
          }
          if (snap.docs.length < 500) return out;
          last = snap.docs[snap.docs.length - 1];
        }
      } catch (e) {
        throw friendly(e);
      }
    },
    async upsert(uid, rows) {
      try {
        for (let i = 0; i < rows.length; i += 450) {
          const batch = writeBatch(db);
          for (const r of rows.slice(i, i + 450)) {
            batch.set(doc(records(uid), `${r.store}__${r.id}`), {
              store: r.store,
              id: r.id,
              json: r.deleted ? null : JSON.stringify(r.data),
              deleted: r.deleted,
              updatedAt: serverTimestamp(),
            });
          }
          await batch.commit();
        }
      } catch (e) {
        throw friendly(e);
      }
    },
  };
}
