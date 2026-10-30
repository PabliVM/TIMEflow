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
