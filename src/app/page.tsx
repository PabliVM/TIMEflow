'use client';

import dynamic from 'next/dynamic';

// La app vive en el cliente: los datos están en IndexedDB del dispositivo.
const TimeflowApp = dynamic(() => import('@/ui/TimeflowApp'), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-dvh items-center justify-center bg-bg">
      <p className="font-display text-xl font-semibold tracking-tight text-muted">TIMEFLOW</p>
    </div>
  ),
});

export default function Page() {
  return <TimeflowApp />;
}
