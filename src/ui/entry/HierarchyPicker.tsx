'use client';

import { useState } from 'react';
import { bySort, CATEGORY_COLORS } from '@/domain/hierarchy';
import { useStore, UserError } from '@/state/store';
import type { NodeKind, SubInput } from '@/state/store';
import { Icon } from '../icons';
import { cx, Input } from '../primitives';
import { useUI } from '../ui-context';

export interface Selection {
  categoryId?: string;
  activityId?: string;
  subs: SubInput[];
}

function Chip({ selected, color, onClick, children }: { selected: boolean; color?: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cx(
        'inline-flex min-h-10 max-w-full items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors',
        selected ? 'border-transparent text-fg' : 'border-line text-fg hover:bg-surface2',
      )}
      style={selected && color ? { background: `color-mix(in srgb, ${color} 24%, transparent)`, borderColor: color } : undefined}
    >
      {color && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />}
      <span className="truncate">{children}</span>
    </button>
  );
}

function Creator({ kind, parentId, onCreated }: { kind: NodeKind; parentId: string | null; onCreated: (id: string) => void }) {
  const { createNode, snapshot } = useStore();
  const { toast } = useUI();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const create = async () => {
    try {
      const color = CATEGORY_COLORS[snapshot.categories.length % CATEGORY_COLORS.length];
      const id = await createNode(kind, parentId, name, color);
      setName('');
      setOpen(false);
      onCreated(id);
    } catch (e) {
      toast(e instanceof UserError ? e.message : 'No se pudo crear.');
    }
  };
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-10 items-center gap-1 rounded-full border border-dashed border-line px-3.5 text-sm text-muted hover:text-fg">
        <Icon name="plus" size={16} /> Nueva
      </button>
    );
  return (
    <div className="flex w-full gap-2">
      <Input
        autoFocus
        value={name}
        placeholder="Nombre"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            create();
          }
        }}
      />
      <button type="button" onClick={create} className="min-h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-accentfg">
        Crear
      </button>
      <button type="button" onClick={() => setOpen(false)} className="min-h-11 rounded-xl px-3 text-sm text-muted">
        Cancelar
      </button>
    </div>
  );
}

export function HierarchyPicker({ value, onChange, showSubDurations = true }: { value: Selection; onChange: (v: Selection) => void; showSubDurations?: boolean }) {
  const { snapshot, lookup } = useStore();
  const cats = snapshot.categories.filter((c) => !c.archived || c.id === value.categoryId).sort(bySort);
  const acts = snapshot.activities
    .filter((a) => a.categoryId === value.categoryId && (!a.archived || a.id === value.activityId))
    .sort(bySort);
  const selectedSubs = new Set(value.subs.map((s) => s.subactivityId));
  const subs = snapshot.subactivities
    .filter((s) => s.activityId === value.activityId && (!s.archived || selectedSubs.has(s.id)))
    .sort(bySort);
  const color = value.categoryId ? lookup.category.get(value.categoryId)?.color : undefined;

  const toggleSub = (id: string) =>
    onChange({
      ...value,
      subs: selectedSubs.has(id) ? value.subs.filter((s) => s.subactivityId !== id) : [...value.subs, { subactivityId: id }],
    });

  const catName = value.categoryId ? lookup.category.get(value.categoryId)?.name : undefined;
  const actName = value.activityId ? lookup.activity.get(value.activityId)?.name : undefined;

  return (
    <div className="flex flex-col">
      <Level title="Categoría" note="obligatoria">
        <div className="flex flex-wrap gap-2">
          {cats.map((c) => (
            <Chip key={c.id} color={c.color} selected={c.id === value.categoryId} onClick={() => onChange({ categoryId: c.id, subs: [] })}>
              {c.name}
            </Chip>
          ))}
          <Creator kind="category" parentId={null} onCreated={(id) => onChange({ categoryId: id, subs: [] })} />
        </div>
      </Level>

      <Level depth={1} color={color} title={catName ? `Actividad de ${catName}` : 'Actividad'} note="opcional" locked={!value.categoryId ? 'Elige primero una categoría.' : undefined}>
        <div className="flex flex-wrap gap-2">
          {acts.map((a) => (
            <Chip
              key={a.id}
              color={color}
              selected={a.id === value.activityId}
              onClick={() => onChange({ ...value, activityId: a.id === value.activityId ? undefined : a.id, subs: [] })}
            >
              {a.name}
            </Chip>
          ))}
          <Creator kind="activity" parentId={value.categoryId ?? null} onCreated={(id) => onChange({ ...value, activityId: id, subs: [] })} />
        </div>
      </Level>

      {/* Subactividades ocultas al registrar; solo visibles si el registro ya las tiene. */}
      {value.subs.length > 0 && (
      <Level depth={2} color={color} title={actName ? `Subactividades de ${actName}` : 'Subactividades'} note="opcional, varias" locked={!value.activityId ? 'Elige primero una actividad.' : undefined}>
        <div className="flex flex-wrap gap-2">
          {subs.map((s) => (
            <Chip key={s.id} color={color} selected={selectedSubs.has(s.id)} onClick={() => toggleSub(s.id)}>
              {s.name}
            </Chip>
          ))}
          <Creator
            kind="subactivity"
            parentId={value.activityId ?? null}
            onCreated={(id) => onChange({ ...value, subs: [...value.subs, { subactivityId: id }] })}
          />
        </div>
          {showSubDurations && value.subs.length > 1 && (
            <div className="mt-1 flex flex-col gap-2 rounded-xl bg-surface2 p-3">
              <p className="text-xs text-muted">Tiempo individual opcional. Está incluido en el total, no se suma.</p>
              {value.subs.map((s) => (
                <label key={s.subactivityId} className="flex items-center gap-3 text-sm">
                  <span className="min-w-0 flex-1 truncate">{lookup.subactivity.get(s.subactivityId)?.name}</span>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    className="w-24"
                    placeholder="min"
                    value={s.durationSeconds != null ? String(Math.round(s.durationSeconds / 60)) : ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      onChange({
                        ...value,
                        subs: value.subs.map((x) =>
                          x.subactivityId === s.subactivityId ? { ...x, durationSeconds: v === '' ? undefined : Math.max(0, Number(v)) * 60 } : x,
                        ),
                      });
                    }}
                  />
                  <span className="w-6 text-muted">min</span>
                </label>
              ))}
            </div>
          )}
      </Level>
      )}
    </div>
  );
}

/** Nivel de la jerarquía; los niveles hijos cuelgan del anterior con una línea guía. */
function Level({ title, note, depth = 0, color, locked, children }: { title: string; note: string; depth?: number; color?: string; locked?: string; children: React.ReactNode }) {
  return (
    <div
      className={cx('flex flex-col gap-2 py-2', depth > 0 && 'border-l-2 pl-4')}
      style={{ marginLeft: depth ? (depth - 1) * 18 + 6 : 0, borderColor: depth ? (locked ? 'rgb(var(--line))' : color) : undefined }}
    >
      <span className={cx('text-xs font-semibold uppercase tracking-wide', locked ? 'text-muted/60' : 'text-muted')}>
        {depth > 0 && '↳ '}
        {title} <span className="font-normal normal-case tracking-normal">· {note}</span>
      </span>
      {locked ? <p className="text-sm text-muted/70">{locked}</p> : children}
    </div>
  );
}
