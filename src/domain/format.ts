import { parseDateKey, pad } from './time';
import type { ISODate } from './types';

const LOCALE = 'es-ES';

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s > 0 && s < 60) return `${s}s`;
  const totalMin = Math.round(s / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (!h) return `${m}m`;
  if (!m) return `${h}h`;
  return `${h}h ${m}m`;
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

export function formatTime(iso: string, use24h: boolean): string {
  return new Date(iso).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit', hour12: !use24h });
}

export function formatDate(key: ISODate, opts: Intl.DateTimeFormatOptions): string {
  return parseDateKey(key).toLocaleDateString(LOCALE, opts);
}

export const formatDayLong = (key: ISODate) => formatDate(key, { weekday: 'long', day: 'numeric', month: 'long' });
export const formatDayShort = (key: ISODate) => formatDate(key, { day: 'numeric', month: 'short' });
export const formatWeekday = (key: ISODate) => formatDate(key, { weekday: 'short' }).replace('.', '');
export const formatMonthYear = (key: ISODate) => formatDate(key, { month: 'long', year: 'numeric' });

export function formatPercent(ratio: number, digits = 1): string {
  return (ratio * 100).toLocaleString(LOCALE, { maximumFractionDigits: digits, minimumFractionDigits: 0 }) + ' %';
}

export const formatHours = (seconds: number) =>
  (seconds / 3600).toLocaleString(LOCALE, { maximumFractionDigits: 1 }) + ' h';

export function formatDateTime(iso: string, use24h: boolean): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' })} ${formatTime(iso, use24h)}`;
}

/**
 * Campo de duración tipo reloj. Solo dígitos; con 3-4 dígitos se lee H:MM
 * ("130" → 1:30), con 1-2 dígitos son minutos ("45" → 0:45).
 */
export function maskClockInput(raw: string): string {
  const d = raw.replace(/\D/g, '').replace(/^0+(?=\d{3})/, '').slice(0, 4);
  return d.length >= 3 ? `${d.slice(0, -2)}:${d.slice(-2)}` : d;
}

/** Segundos, 0 si vacío, null si no es válido. */
export function parseClockInput(v: string): number | null {
  const d = v.replace(/\D/g, '');
  if (!d) return 0;
  const h = d.length >= 3 ? Number(d.slice(0, -2)) : 0;
  const m = Number(d.slice(-2));
  if (d.length >= 3 && m > 59) return null;
  return (h * 60 + m) * 60;
}

export const toClockInput = (totalMin: number) => (totalMin ? `${Math.floor(totalMin / 60)}:${pad(totalMin % 60)}` : '');
