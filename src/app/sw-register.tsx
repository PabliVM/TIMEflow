'use client';

import { useEffect } from 'react';

export function SwRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    // Si había una versión anterior controlando la página, recargar al activarse la nueva.
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    const onChange = () => {
      if (!hadController || reloaded) return;
      reloaded = true;
      location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onChange);
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        const check = () => document.visibilityState === 'visible' && reg.update().catch(() => undefined);
        document.addEventListener('visibilitychange', check);
      })
      .catch(() => undefined);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onChange);
  }, []);
  return null;
}
