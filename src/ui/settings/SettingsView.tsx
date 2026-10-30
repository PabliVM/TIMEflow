'use client';

import { useRef, useState } from 'react';
import { toBackup, validateBackup, entriesToCsv } from '@/domain/backup';
import type { BackupValidation } from '@/domain/backup';
import { bySort, CATEGORY_COLORS } from '@/domain/hierarchy';
import type { Activity, Category, Subactivity } from '@/domain/types';
import { todayKey } from '@/domain/time';
import { useStore, UserError } from '@/state/store';
import type { NodeKind } from '@/state/store';
import { GoalList } from '../analysis/GoalsTab';
import { downloadFile } from '../hooks';
import { Icon } from '../icons';
import { Button, Card, Field, IconButton, Input, Segmented, Select, Sheet, cx } from '../primitives';
import { useUI } from '../ui-context';
import { SyncCard } from './SyncCard';

type Tab = 'categories' | 'goals' | 'prefs' | 'data';
type Node = Category | Activity | Subactivity;

function EditNode({ kind, node, onClose }: { kind: NodeKind; node: Node; onClose: () => void }) {
  const { updateNode } = useStore();
  const ui = useUI();
  const [name, setName] = useState(node.name);
  const [color, setColor] = useState((node as Category).color ?? '');
  const [error, setError] = useState('');
  const save = async (patch: { name?: string; color?: string; archived?: boolean }) => {
    try {
      await updateNode(kind, node.id, patch);
      ui.toast('Guardado');
      onClose();
    } catch (e) {
      setError(e instanceof UserError ? e.message : 'No se pudo guardar.');
    }
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title={kind === 'category' ? 'Editar categoría' : kind === 'activity' ? 'Editar actividad' : 'Editar subactividad'}
      footer={
        <>
          <Button icon={node.archived ? 'restore' : 'archive'} variant="ghost" onClick={() => save({ archived: !node.archived })}>
            {node.archived ? 'Reactivar' : 'Archivar'}
          </Button>
          <Button className="flex-1" variant="primary" onClick={() => save(kind === 'category' ? { name, color } : { name })}>Guardar</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Nombre">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        {kind === 'category' && (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">Color</span>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_COLORS.map((c) => (
                <button key={c} type="button" aria-label={`Color ${c}`} aria-pressed={c === color} onClick={() => setColor(c)}
                  className={cx('h-11 w-11 rounded-xl', c === color && 'ring-2 ring-fg ring-offset-2 ring-offset-surface')} style={{ background: c }} />
              ))}
              <label className="flex h-11 items-center gap-2 rounded-xl border border-line px-3 text-sm">
                Otro <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-7 w-9 cursor-pointer bg-transparent" />
              </label>
            </div>
          </div>
        )}
        {node.archived && <p className="text-sm text-muted">Archivado: no aparece al registrar, pero su histórico se conserva.</p>}
        {error && <p className="rounded-xl bg-danger/10 p-3 text-sm text-danger" role="alert">{error}</p>}
      </div>
    </Sheet>
  );
}

function AddInline({ kind, parentId, label }: { kind: NodeKind; parentId: string | null; label: string }) {
  const { createNode, snapshot } = useStore();
  const ui = useUI();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const add = async () => {
    try {
      await createNode(kind, parentId, name, CATEGORY_COLORS[snapshot.categories.length % CATEGORY_COLORS.length]);
      setName('');
      setOpen(false);
    } catch (e) {
      ui.toast(e instanceof UserError ? e.message : 'No se pudo crear.');
    }
  };
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-sm text-muted hover:text-accent">
        <Icon name="plus" size={16} /> {label}
      </button>
    );
  return (
    <div className="flex gap-2 py-1">
      <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" onKeyDown={(e) => e.key === 'Enter' && add()} />
      <Button variant="primary" onClick={add}>Añadir</Button>
      <IconButton icon="x" label="Cancelar" onClick={() => setOpen(false)} />
    </div>
  );
}

function NodeRow({ kind, node, color, first, last, expanded, onToggle, onEdit, depth }: {
  kind: NodeKind; node: Node; color: string; first: boolean; last: boolean; expanded?: boolean; onToggle?: () => void; onEdit: () => void; depth: number;
}) {
  const { moveNode } = useStore();
  return (
    <div className={cx('flex min-h-12 items-center gap-1 rounded-xl pr-1', node.archived && 'opacity-55')} style={{ paddingLeft: depth * 16 }}>
      {onToggle ? (
        <IconButton icon={expanded ? 'down' : 'right'} label={expanded ? 'Contraer' : 'Expandir'} onClick={onToggle} size={18} />
      ) : (
        <span className="w-11 shrink-0" />
      )}
      <span className={cx('shrink-0 rounded-full', kind === 'category' ? 'h-3.5 w-3.5' : 'h-2 w-2')} style={{ background: color }} />
      <button type="button" onClick={onToggle ?? onEdit} className="min-h-11 min-w-0 flex-1 truncate px-2 text-left text-sm font-medium">
        {node.name}
        {node.archived && <span className="ml-2 text-xs text-muted">archivado</span>}
      </button>
      <IconButton icon="up" label="Subir" size={16} disabled={first} onClick={() => moveNode(kind, node.id, -1)} />
      <IconButton icon="down" label="Bajar" size={16} disabled={last} onClick={() => moveNode(kind, node.id, 1)} />
      <IconButton icon="edit" label="Editar" size={16} onClick={onEdit} />
    </div>
  );
}

function CategoriesTab() {
  const { snapshot } = useStore();
  const [showArchived, setShowArchived] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ kind: NodeKind; node: Node } | null>(null);
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const visible = <T extends Node>(l: T[]) => l.filter((x) => showArchived || !x.archived).sort(bySort);
  const cats = visible(snapshot.categories);

  return (
    <Card
      title="Categorías, actividades y subactividades"
      action={
        <label className="flex min-h-11 items-center gap-2 text-sm text-muted">
          <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--accent))]" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Mostrar archivados
        </label>
      }
    >
      <div className="flex flex-col">
        {cats.map((c, ci) => {
          const acts = visible(snapshot.activities.filter((a) => a.categoryId === c.id));
          return (
            <div key={c.id} className="border-b border-line py-1 last:border-0">
              <NodeRow kind="category" node={c} color={c.color} depth={0} first={ci === 0} last={ci === cats.length - 1} expanded={open.has(c.id)} onToggle={() => toggle(c.id)} onEdit={() => setEditing({ kind: 'category', node: c })} />
              {open.has(c.id) && (
                <div className="flex flex-col">
                  {acts.map((a, ai) => {
                    const subs = visible(snapshot.subactivities.filter((s) => s.activityId === a.id));
                    return (
                      <div key={a.id}>
                        <NodeRow kind="activity" node={a} color={c.color} depth={1} first={ai === 0} last={ai === acts.length - 1} expanded={open.has(a.id)} onToggle={() => toggle(a.id)} onEdit={() => setEditing({ kind: 'activity', node: a })} />
                        {open.has(a.id) && (
                          <div className="flex flex-col">
                            {subs.map((s, si) => (
                              <NodeRow key={s.id} kind="subactivity" node={s} color={c.color} depth={2} first={si === 0} last={si === subs.length - 1} onEdit={() => setEditing({ kind: 'subactivity', node: s })} />
                            ))}
                            <div style={{ paddingLeft: 2 * 16 + 44 }}><AddInline kind="subactivity" parentId={a.id} label="Subactividad" /></div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div style={{ paddingLeft: 16 + 44 }}><AddInline kind="activity" parentId={c.id} label="Actividad" /></div>
                </div>
              )}
            </div>
          );
        })}
        <div className="pt-2"><AddInline kind="category" parentId={null} label="Nueva categoría" /></div>
      </div>
      {editing && <EditNode kind={editing.kind} node={editing.node} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function PrefsTab() {
  const { snapshot, updateSettings } = useStore();
  const s = snapshot.settings;
  const sleepActs = snapshot.activities.filter((a) => !a.archived).sort(bySort);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="Calendario">
        <div className="flex flex-col gap-4">
          <Field label="Vista inicial">
            {() => <Segmented value={s.defaultCalendarView} onChange={(v) => updateSettings({ defaultCalendarView: v })} options={[{ value: 'day', label: 'Día' }, { value: 'week', label: 'Semana' }, { value: 'month', label: 'Mes' }]} />}
          </Field>
          <Field label="Primer día de la semana">
            {() => <Segmented value={String(s.weekStartsOn)} onChange={(v) => updateSettings({ weekStartsOn: Number(v) as 0 | 1 })} options={[{ value: '1', label: 'Lunes' }, { value: '0', label: 'Domingo' }]} />}
          </Field>
          <Field label="Formato de hora">
            {() => <Segmented value={s.use24h ? '24' : '12'} onChange={(v) => updateSettings({ use24h: v === '24' })} options={[{ value: '24', label: '24 horas' }, { value: '12', label: '12 horas' }]} />}
          </Field>
        </div>
      </Card>
      <Card title="Apariencia y sueño">
        <div className="flex flex-col gap-4">
          <Field label="Tema">
            {() => <Segmented value={s.theme} onChange={(theme) => updateSettings({ theme })} options={[{ value: 'system', label: 'Sistema' }, { value: 'light', label: 'Claro' }, { value: 'dark', label: 'Oscuro' }]} />}
          </Field>
          <Field label="Fondo">
            {() => <Segmented value={s.background === 'stars' || s.background === 'plain' ? s.background : 'forest'} onChange={(background) => updateSettings({ background })} options={[{ value: 'forest', label: 'Bosque' }, { value: 'stars', label: 'Estrellas' }, { value: 'plain', label: 'Liso' }]} />}
          </Field>
          <Field label="Actividad de sueño" hint="Se usa por defecto en el registro de sueño.">
            {(id) => (
              <Select id={id} value={s.sleepActivityId ?? ''} onChange={(e) => {
                const a = snapshot.activities.find((x) => x.id === e.target.value);
                updateSettings({ sleepActivityId: a?.id, sleepCategoryId: a?.categoryId, sleepSubactivityId: undefined });
              }}>
                <option value="">Ninguna</option>
                {sleepActs.map((a) => <option key={a.id} value={a.id}>{snapshot.categories.find((c) => c.id === a.categoryId)?.name} › {a.name}</option>)}
              </Select>
            )}
          </Field>
        </div>
      </Card>
    </div>
  );
}

function DataTab() {
  const { snapshot, replaceAll } = useStore();
  const ui = useUI();
  const fileRef = useRef<HTMLInputElement>(null);
  const [check, setCheck] = useState<(BackupValidation & { name: string }) | null>(null);

  const exportJson = () => {
    downloadFile(`timeflow-copia-${todayKey()}.json`, JSON.stringify(toBackup(snapshot), null, 2), 'application/json');
    ui.toast('Copia exportada');
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      setCheck({ ...validateBackup(JSON.parse(await f.text())), name: f.name });
    } catch {
      setCheck({ ok: false, errors: ['El archivo no es un JSON válido.'], name: f.name });
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const doImport = async () => {
    if (!check?.snapshot) return;
    const ok = await ui.confirm({
      title: 'Sustituir todos los datos',
      message: `Se reemplazarán ${snapshot.entries.length} registros actuales por ${check.snapshot.entries.length} del archivo. Antes se descargará una copia de seguridad de los datos actuales.`,
      confirmLabel: 'Sustituir',
      danger: true,
    });
    if (!ok) return;
    downloadFile(`timeflow-antes-de-importar-${todayKey()}.json`, JSON.stringify(toBackup(snapshot), null, 2), 'application/json');
    await replaceAll(check.snapshot);
    setCheck(null);
    ui.toast('Datos importados');
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <SyncCard />
      <Card title="Exportar">
        <p className="mb-3 text-sm text-muted">{snapshot.entries.length} registros · {snapshot.categories.length} categorías · {snapshot.goals.length} objetivos.</p>
        <div className="flex flex-wrap gap-2">
          <Button icon="download" variant="primary" onClick={exportJson}>Copia completa (JSON)</Button>
          <Button icon="download" onClick={() => { downloadFile(`timeflow-registros-${todayKey()}.csv`, entriesToCsv(snapshot, snapshot.entries), 'text/csv;charset=utf-8'); ui.toast('CSV exportado'); }}>
            Registros (CSV)
          </Button>
        </div>
      </Card>
      <Card title="Importar copia">
        <p className="mb-3 text-sm text-muted">Se valida la estructura antes de sustituir nada.</p>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        <Button icon="upload" onClick={() => fileRef.current?.click()}>Elegir archivo JSON</Button>
        {check && (
          <div className={cx('mt-3 rounded-xl p-3 text-sm', check.ok ? 'bg-accent/10' : 'bg-danger/10 text-danger')}>
            <p className="font-semibold">{check.name}</p>
            {check.ok && check.snapshot ? (
              <>
                <p className="mt-1 text-fg">
                  Válido: {check.snapshot.entries.length} registros, {check.snapshot.categories.length} categorías, {check.snapshot.goals.length} objetivos.
                </p>
                <Button variant="danger" className="mt-3" onClick={doImport}>Sustituir mis datos</Button>
              </>
            ) : (
              <ul className="mt-1 list-disc pl-5">{check.errors.map((e) => <li key={e}>{e}</li>)}</ul>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

export function SettingsView() {
  const [tab, setTab] = useState<Tab>('categories');
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl font-semibold tracking-tight">Configuración</h1>
      <div className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
        <Segmented value={tab} onChange={setTab} className="min-w-[24rem] md:max-w-xl"
          options={[{ value: 'categories', label: 'Categorías' }, { value: 'goals', label: 'Objetivos' }, { value: 'prefs', label: 'Preferencias' }, { value: 'data', label: 'Datos' }]} />
      </div>
      {tab === 'categories' && <CategoriesTab />}
      {tab === 'goals' && <GoalList includeArchived />}
      {tab === 'prefs' && <PrefsTab />}
      {tab === 'data' && <DataTab />}
    </div>
  );
}
