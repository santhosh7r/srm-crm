'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { Check, CloudOff, FileSpreadsheet, Plus, X } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { SheetGrid } from '@/components/sheets/SheetGrid';
import { SheetToolbar } from '@/components/sheets/SheetToolbar';
import {
  cellKey, colName, computeValues, DEFAULT_COL_W, forEachCell, formatValue,
  fromTSV, normalizeCell, normRange, parseRef,
  rangeLabel, remapFormula, toStr, toTSV, translateFormula, valueAt,
} from '@/lib/sheets/engine';
import type { Cell, CellStyle, Doc, Range, Sheet } from '@/lib/sheets/engine';

const STORAGE_KEY = 'riya-sheets-v1';
const DEFAULT_ROWS = 100;
const DEFAULT_COLS = 26;
const MAX_HISTORY = 60;

type SaveState = 'saved' | 'saving' | 'offline';
type Editing = { r: number; c: number; value: string; caretAtEnd: boolean; fromBar?: boolean };
type Clip = {
  text: string;
  cells: (Cell | null)[][];
  rows: number;
  cols: number;
  /** Top-left of the copied block, so pasted formulas shift by the right amount. */
  origin: { r: number; c: number };
} | null;

const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `s${Date.now()}${Math.random()}`;

function readLocal(): Doc | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Doc;
    return parsed?.sheets?.length ? parsed : null;
  } catch {
    return null;
  }
}

function writeLocal(doc: Doc) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
  } catch {
    /* quota or private mode — the server copy is the source of truth anyway */
  }
}

const blankDoc = (): Doc => {
  const first = makeSheet('Sheet1');
  return { sheets: [first], activeId: first.id };
};

const makeSheet = (name: string): Sheet => ({
  id: uid(),
  name,
  rows: DEFAULT_ROWS,
  cols: DEFAULT_COLS,
  cells: {},
  colW: {},
  rowH: {},
});

/* ────────────────────────── sheet transforms ─────────────────────── */

function writeCells(sheet: Sheet, edits: Array<[string, Cell | null]>): Sheet {
  const cells = { ...sheet.cells };
  for (const [key, cell] of edits) {
    const norm = normalizeCell(cell ?? undefined);
    if (norm) cells[key] = norm;
    else delete cells[key];
  }
  return { ...sheet, cells };
}

/** Shift a numeric-keyed map (column widths / row heights) around an insert or delete. */
function shiftSizes(sizes: Record<number, number>, at: number, delta: number): Record<number, number> {
  const out: Record<number, number> = {};
  for (const [k, v] of Object.entries(sizes)) {
    const i = Number(k);
    if (delta < 0 && i === at) continue;
    out[i >= at ? i + delta : i] = v;
  }
  return out;
}

function insertLine(sheet: Sheet, at: number, axis: 'row' | 'col'): Sheet {
  const cells: Record<string, Cell> = {};
  for (const [key, cell] of Object.entries(sheet.cells)) {
    const p = parseRef(key);
    if (!p) continue;
    const idx = axis === 'row' ? p.r : p.c;
    const moved = idx >= at;
    const nk = moved ? cellKey(axis === 'row' ? p.r + 1 : p.r, axis === 'col' ? p.c + 1 : p.c) : key;
    cells[nk] = cell.v?.startsWith('=')
      ? {
          ...cell,
          v: remapFormula(cell.v, (r, c) =>
            axis === 'row' ? { r: r >= at ? r + 1 : r, c } : { r, c: c >= at ? c + 1 : c },
          ),
        }
      : cell;
  }
  return {
    ...sheet,
    cells,
    rows: axis === 'row' ? sheet.rows + 1 : sheet.rows,
    cols: axis === 'col' ? sheet.cols + 1 : sheet.cols,
    rowH: axis === 'row' ? shiftSizes(sheet.rowH, at, 1) : sheet.rowH,
    colW: axis === 'col' ? shiftSizes(sheet.colW, at, 1) : sheet.colW,
  };
}

function deleteLine(sheet: Sheet, at: number, axis: 'row' | 'col'): Sheet {
  const cells: Record<string, Cell> = {};
  for (const [key, cell] of Object.entries(sheet.cells)) {
    const p = parseRef(key);
    if (!p) continue;
    const idx = axis === 'row' ? p.r : p.c;
    if (idx === at) continue;
    const nk = idx > at ? cellKey(axis === 'row' ? p.r - 1 : p.r, axis === 'col' ? p.c - 1 : p.c) : key;
    cells[nk] = cell.v?.startsWith('=')
      ? {
          ...cell,
          v: remapFormula(cell.v, (r, c) => {
            if (axis === 'row') return r === at ? null : { r: r > at ? r - 1 : r, c };
            return c === at ? null : { r, c: c > at ? c - 1 : c };
          }),
        }
      : cell;
  }
  return {
    ...sheet,
    cells,
    rows: axis === 'row' ? Math.max(1, sheet.rows - 1) : sheet.rows,
    cols: axis === 'col' ? Math.max(1, sheet.cols - 1) : sheet.cols,
    rowH: axis === 'row' ? shiftSizes(sheet.rowH, at, -1) : sheet.rowH,
    colW: axis === 'col' ? shiftSizes(sheet.colW, at, -1) : sheet.colW,
  };
}

/* ──────────────────────────────  page  ───────────────────────────── */

export default function SheetsPage() {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [sel, setSel] = useState<Range>({ r1: 0, c1: 0, r2: 0, c2: 0 });
  const [active, setActive] = useState({ r: 0, c: 0 });
  const [editing, setEditing] = useState<Editing | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [nameBox, setNameBox] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [ready, setReady] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
  const [histVersion, setHistVersion] = useState(0);

  const gridRef = useRef<HTMLTextAreaElement>(null);
  const undoStack = useRef<Doc[]>([]);
  const redoStack = useRef<Doc[]>([]);
  const clipboard = useRef<Clip>(null);
  const docRef = useRef<Doc | null>(null);
  /** JSON of the last workbook the server acknowledged — the autosave diff baseline. */
  const lastSaved = useRef<string | null>(null);
  const canSync = useRef(false);
  /** Whether this device has edits the server has not seen yet. */
  const dirtySinceLoad = useRef(false);

  const sheet = doc ? (doc.sheets.find((s) => s.id === doc.activeId) ?? doc.sheets[0]) : null;
  const values = useMemo(() => (sheet ? computeValues(sheet.cells) : new Map()), [sheet]);
  const range = normRange(sel);

  /* ── load / save ── */

  useEffect(() => {
    setIsTouch(window.matchMedia('(pointer: coarse)').matches);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const local = readLocal();
      try {
        const res = await fetch('/api/sheets');
        if (!res.ok) throw new Error(String(res.status));
        const json = await res.json();
        if (cancelled) return;

        const server = (json?.data?.doc ?? null) as Doc | null;
        if (server?.sheets?.length) {
          setDoc(server);
          lastSaved.current = JSON.stringify(server);
          writeLocal(server);
        } else {
          // Nothing saved yet — adopt whatever this device has and push it up.
          setDoc(local ?? blankDoc());
          lastSaved.current = null;
        }
        canSync.current = true;
        setSaveState('saved');
      } catch {
        if (cancelled) return;
        // Offline or the API is down: work from the local copy and keep retrying,
        // but never overwrite the server until we have seen what it holds.
        setDoc(local ?? blankDoc());
        canSync.current = false;
        setSaveState('offline');
      }
      if (!cancelled) setReady(true);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep retrying the initial sync so an offline session recovers on its own.
  useEffect(() => {
    if (!ready || canSync.current || saveState !== 'offline') return;
    const id = window.setInterval(async () => {
      try {
        const res = await fetch('/api/sheets');
        if (!res.ok) return;
        const json = await res.json();
        const server = (json?.data?.doc ?? null) as Doc | null;
        canSync.current = true;
        // Local edits made while offline win; otherwise take the server's copy.
        if (!docRef.current || (server?.sheets?.length && !dirtySinceLoad.current)) {
          if (server?.sheets?.length) {
            setDoc(server);
            lastSaved.current = JSON.stringify(server);
          }
        }
        setSaveState('saving');
        window.clearInterval(id);
      } catch {
        /* still offline — try again on the next tick */
      }
    }, 20000);
    return () => window.clearInterval(id);
  }, [ready, saveState]);


  const push = useCallback(async (next: Doc) => {
    const json = JSON.stringify(next);
    try {
      const res = await fetch('/api/sheets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc: next }),
      });
      if (!res.ok) throw new Error(String(res.status));
      lastSaved.current = json;
      setSaveState('saved');
    } catch {
      setSaveState('offline');
    }
  }, []);

  // Autosave: the local copy is written immediately, the server after a short pause.
  useEffect(() => {
    if (!doc) return;
    docRef.current = doc;
    writeLocal(doc);
    if (!ready) return;

    const json = JSON.stringify(doc);
    if (json === lastSaved.current) return;
    dirtySinceLoad.current = true;
    if (!canSync.current) {
      setSaveState('offline');
      return;
    }

    setSaveState('saving');
    const id = window.setTimeout(() => void push(doc), 900);
    return () => window.clearTimeout(id);
  }, [doc, ready, push]);

  // Last-chance save when the tab is hidden or closed — important on mobile,
  // where switching apps can end the session without warning.
  useEffect(() => {
    const flush = () => {
      const current = docRef.current;
      if (!current || !canSync.current) return;
      const json = JSON.stringify(current);
      if (json === lastSaved.current) return;
      try {
        void fetch('/api/sheets', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ doc: current }),
          keepalive: true,
        });
        lastSaved.current = json;
      } catch {
        /* nothing more we can do at teardown; the local copy still has it */
      }
    };
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
    };
  }, []);

  /* ── history ── */

  const apply = useCallback(
    (next: Doc) => {
      if (!doc) return;
      undoStack.current = [...undoStack.current, doc].slice(-MAX_HISTORY);
      redoStack.current = [];
      setDoc(next);
      setHistVersion((v) => v + 1);
    },
    [doc],
  );

  const editSheet = useCallback(
    (fn: (s: Sheet) => Sheet) => {
      if (!doc || !sheet) return;
      apply({ ...doc, sheets: doc.sheets.map((s) => (s.id === sheet.id ? fn(s) : s)) });
    },
    [apply, doc, sheet],
  );

  /** Column widths and row heights are visual noise in the undo stack — skip history. */
  const editSheetQuiet = useCallback(
    (fn: (s: Sheet) => Sheet) => {
      setDoc((d) => (d ? { ...d, sheets: d.sheets.map((s) => (s.id === d.activeId ? fn(s) : s)) } : d));
    },
    [],
  );

  const undo = useCallback(() => {
    if (!doc) return;
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current = [...redoStack.current, doc].slice(-MAX_HISTORY);
    setDoc(prev);
    setEditing(null);
    setHistVersion((v) => v + 1);
  }, [doc]);

  const redo = useCallback(() => {
    if (!doc) return;
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current = [...undoStack.current, doc].slice(-MAX_HISTORY);
    setDoc(next);
    setEditing(null);
    setHistVersion((v) => v + 1);
  }, [doc]);

  const canUndo = useMemo(() => undoStack.current.length > 0, [histVersion]);
  const canRedo = useMemo(() => redoStack.current.length > 0, [histVersion]);

  /* ── selection helpers ── */

  const activeKey = cellKey(active.r, active.c);
  const activeCell = sheet?.cells[activeKey];
  const activeStyle: CellStyle = activeCell?.s ?? {};

  useEffect(() => {
    setNameBox(rangeLabel(sel));
  }, [sel]);

  const select = useCallback((next: Range, nextActive?: { r: number; c: number }) => {
    setSel(next);
    if (nextActive) setActive(nextActive);
  }, []);

  const moveTo = useCallback(
    (r: number, c: number, extend = false) => {
      if (!sheet) return;
      const rr = Math.max(0, Math.min(sheet.rows - 1, r));
      const cc = Math.max(0, Math.min(sheet.cols - 1, c));
      if (extend) setSel((s) => ({ ...s, r2: rr, c2: cc }));
      else {
        setSel({ r1: rr, c1: cc, r2: rr, c2: cc });
        setActive({ r: rr, c: cc });
      }
    },
    [sheet],
  );

  /* ── editing ── */

  const startEdit = useCallback(
    (r: number, c: number, initial?: string) => {
      if (!sheet) return;
      const raw = sheet.cells[cellKey(r, c)]?.v ?? '';
      setActive({ r, c });
      setSel({ r1: r, c1: c, r2: r, c2: c });
      setEditing({ r, c, value: initial ?? raw, caretAtEnd: initial !== undefined });
    },
    [sheet],
  );

  const commitEdit = useCallback(
    (move: 'down' | 'right' | 'up' | 'left' | 'none') => {
      if (!editing || !sheet) return;
      const key = cellKey(editing.r, editing.c);
      const prev = sheet.cells[key];
      if ((prev?.v ?? '') !== editing.value) {
        editSheet((s) => writeCells(s, [[key, { v: editing.value, s: prev?.s }]]));
      }
      setEditing(null);
      const delta = { down: [1, 0], up: [-1, 0], right: [0, 1], left: [0, -1], none: [0, 0] }[move];
      moveTo(editing.r + delta[0], editing.c + delta[1]);
      gridRef.current?.focus();
    },
    [editing, sheet, editSheet, moveTo],
  );

  const cancelEdit = useCallback(() => {
    setEditing(null);
    gridRef.current?.focus();
  }, []);

  /* ── formatting ── */

  const applyStyle = useCallback(
    (patch: Partial<CellStyle>) => {
      if (!sheet) return;
      const edits: Array<[string, Cell | null]> = [];
      forEachCell(sel, (r, c) => {
        const key = cellKey(r, c);
        const prev = sheet.cells[key];
        edits.push([key, { v: prev?.v ?? '', s: { ...(prev?.s ?? {}), ...patch } }]);
      });
      editSheet((s) => writeCells(s, edits));
      gridRef.current?.focus();
    },
    [sheet, sel, editSheet],
  );

  const clearFormat = useCallback(() => {
    if (!sheet) return;
    const edits: Array<[string, Cell | null]> = [];
    forEachCell(sel, (r, c) => {
      const key = cellKey(r, c);
      const prev = sheet.cells[key];
      if (prev) edits.push([key, { v: prev.v ?? '' }]);
    });
    editSheet((s) => writeCells(s, edits));
    gridRef.current?.focus();
  }, [sheet, sel, editSheet]);

  const clearContents = useCallback(() => {
    if (!sheet) return;
    const edits: Array<[string, Cell | null]> = [];
    forEachCell(sel, (r, c) => {
      const key = cellKey(r, c);
      const prev = sheet.cells[key];
      if (prev) edits.push([key, { v: '', s: prev.s }]);
    });
    if (edits.length) editSheet((s) => writeCells(s, edits));
  }, [sheet, sel, editSheet]);

  /* ── clipboard ── */

  const readSelection = useCallback((): Clip => {
    if (!sheet) return null;
    const n = normRange(sel);
    const cells: (Cell | null)[][] = [];
    const text: string[][] = [];
    for (let r = n.r1; r <= n.r2; r++) {
      const cellRow: (Cell | null)[] = [];
      const textRow: string[] = [];
      for (let c = n.c1; c <= n.c2; c++) {
        const key = cellKey(r, c);
        const cell = sheet.cells[key] ?? null;
        cellRow.push(cell);
        textRow.push(formatValue(valueAt(values, sheet.cells, key), cell?.s?.fmt));
      }
      cells.push(cellRow);
      text.push(textRow);
    }
    return {
      text: toTSV(text),
      cells,
      rows: n.r2 - n.r1 + 1,
      cols: n.c2 - n.c1 + 1,
      origin: { r: n.r1, c: n.c1 },
    };
  }, [sheet, sel, values]);

  const pasteAt = useCallback(
    (r0: number, c0: number, clip: Clip, plain?: string[][]) => {
      if (!sheet) return;
      const rows = clip ? clip.rows : (plain?.length ?? 0);
      const cols = clip ? clip.cols : Math.max(...(plain ?? [[]]).map((x) => x.length), 0);
      if (!rows || !cols) return;

      // Relative references shift by the distance the block moved.
      const dr = clip ? r0 - clip.origin.r : 0;
      const dc = clip ? c0 - clip.origin.c : 0;

      const edits: Array<[string, Cell | null]> = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const tr = r0 + r;
          const tc = c0 + c;
          if (tr >= sheet.rows || tc >= sheet.cols) continue;
          const key = cellKey(tr, tc);
          if (clip) {
            const src = clip.cells[r][c];
            if (!src) {
              edits.push([key, null]);
              continue;
            }
            const v = src.v?.startsWith('=') ? translateFormula(src.v, dr, dc) : src.v;
            edits.push([key, { v, s: src.s }]);
          } else {
            const prev = sheet.cells[key];
            edits.push([key, { v: plain?.[r]?.[c] ?? '', s: prev?.s }]);
          }
        }
      }
      editSheet((s) => writeCells(s, edits));
      setSel({
        r1: r0,
        c1: c0,
        r2: Math.min(sheet.rows - 1, r0 + rows - 1),
        c2: Math.min(sheet.cols - 1, c0 + cols - 1),
      });
      setActive({ r: r0, c: c0 });
    },
    [sheet, editSheet],
  );

  // Native clipboard events, so Ctrl+C/V talks to Excel and every other app.
  const handlers = useRef({ readSelection, pasteAt, clearContents, active, editing });
  handlers.current = { readSelection, pasteAt, clearContents, active, editing };

  const gridMounted = doc !== null;
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;

    const onCopy = (e: ClipboardEvent) => {
      if (handlers.current.editing) return;
      const clip = handlers.current.readSelection();
      if (!clip) return;
      e.preventDefault();
      e.clipboardData?.setData('text/plain', clip.text);
      clipboard.current = clip;
    };
    const onCut = (e: ClipboardEvent) => {
      if (handlers.current.editing) return;
      onCopy(e);
      handlers.current.clearContents();
    };
    const onPaste = (e: ClipboardEvent) => {
      if (handlers.current.editing) return;
      e.preventDefault();
      const text = e.clipboardData?.getData('text/plain') ?? '';
      const { r, c } = handlers.current.active;
      // Same text we put there? Then paste our own cells, styles and all.
      if (clipboard.current && clipboard.current.text === text) {
        handlers.current.pasteAt(r, c, clipboard.current);
      } else if (text) {
        handlers.current.pasteAt(r, c, null, fromTSV(text));
      }
    };

    el.addEventListener('copy', onCopy);
    el.addEventListener('cut', onCut);
    el.addEventListener('paste', onPaste);
    return () => {
      el.removeEventListener('copy', onCopy);
      el.removeEventListener('cut', onCut);
      el.removeEventListener('paste', onPaste);
    };
  }, [gridMounted]);

  /* ── fill handle ── */

  const fill = useCallback(
    (target: Range) => {
      if (!sheet) return;
      const src = normRange(sel);
      const dst = normRange(target);
      const sh = src.r2 - src.r1 + 1;
      const sw = src.c2 - src.c1 + 1;
      const edits: Array<[string, Cell | null]> = [];

      for (let r = dst.r1; r <= dst.r2; r++) {
        for (let c = dst.c1; c <= dst.c2; c++) {
          if (r >= src.r1 && r <= src.r2 && c >= src.c1 && c <= src.c2) continue;
          const sr = src.r1 + (((r - src.r1) % sh) + sh) % sh;
          const sc = src.c1 + (((c - src.c1) % sw) + sw) % sw;
          const from = sheet.cells[cellKey(sr, sc)];
          const key = cellKey(r, c);
          if (!from) {
            edits.push([key, null]);
            continue;
          }
          const v = from.v?.startsWith('=') ? translateFormula(from.v, r - sr, c - sc) : from.v;
          edits.push([key, { v, s: from.s }]);
        }
      }
      editSheet((s) => writeCells(s, edits));
      setSel(dst);
    },
    [sheet, sel, editSheet],
  );

  /* ── rows / columns ── */

  const insertRow = () => editSheet((s) => insertLine(s, range.r1, 'row'));
  const insertCol = () => editSheet((s) => insertLine(s, range.c1, 'col'));
  const removeRow = () =>
    editSheet((s) => {
      let out = s;
      for (let i = range.r2; i >= range.r1; i--) out = deleteLine(out, i, 'row');
      return out;
    });
  const removeCol = () =>
    editSheet((s) => {
      let out = s;
      for (let i = range.c2; i >= range.c1; i--) out = deleteLine(out, i, 'col');
      return out;
    });

  const growIfNeeded = useCallback(
    (r: number, c: number) => {
      if (!sheet) return;
      if (r < sheet.rows - 1 && c < sheet.cols - 1) return;
      editSheetQuiet((s) => ({
        ...s,
        rows: r >= s.rows - 1 ? s.rows + 30 : s.rows,
        cols: c >= s.cols - 1 ? s.cols + 6 : s.cols,
      }));
    },
    [sheet, editSheetQuiet],
  );

  /* ── keyboard ── */

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!sheet || editing) return;
      const mod = e.ctrlKey || e.metaKey;
      const { r, c } = active;

      if (mod && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === 'z') {
          e.preventDefault();
          if (e.shiftKey) redo();
          else undo();
          return;
        }
        if (k === 'y') { e.preventDefault(); redo(); return; }
        if (k === 'b') { e.preventDefault(); applyStyle({ bold: !activeStyle.bold }); return; }
        if (k === 'i') { e.preventDefault(); applyStyle({ italic: !activeStyle.italic }); return; }
        if (k === 'u') { e.preventDefault(); applyStyle({ underline: !activeStyle.underline }); return; }
        if (k === 'a') {
          e.preventDefault();
          select({ r1: 0, c1: 0, r2: sheet.rows - 1, c2: sheet.cols - 1 }, { r: 0, c: 0 });
          return;
        }
        if (k === 'c' || k === 'x' || k === 'v') return; // handled by the clipboard listeners
        if (e.key === 'Home') { e.preventDefault(); moveTo(0, 0); return; }
      }

      switch (e.key) {
        case 'ArrowUp': e.preventDefault(); moveTo(r - 1, c, e.shiftKey); break;
        case 'ArrowDown': e.preventDefault(); growIfNeeded(r + 1, c); moveTo(r + 1, c, e.shiftKey); break;
        case 'ArrowLeft': e.preventDefault(); moveTo(r, c - 1, e.shiftKey); break;
        case 'ArrowRight': e.preventDefault(); growIfNeeded(r, c + 1); moveTo(r, c + 1, e.shiftKey); break;
        case 'Tab': e.preventDefault(); moveTo(r, e.shiftKey ? c - 1 : c + 1); break;
        case 'Enter': e.preventDefault(); moveTo(e.shiftKey ? r - 1 : r + 1, c); break;
        case 'Home': e.preventDefault(); moveTo(r, 0, e.shiftKey); break;
        case 'End': e.preventDefault(); moveTo(r, sheet.cols - 1, e.shiftKey); break;
        case 'PageDown': e.preventDefault(); moveTo(r + 20, c, e.shiftKey); break;
        case 'PageUp': e.preventDefault(); moveTo(r - 20, c, e.shiftKey); break;
        case 'Delete':
        case 'Backspace': e.preventDefault(); clearContents(); break;
        case 'F2': e.preventDefault(); startEdit(r, c, sheet.cells[activeKey]?.v ?? ''); break;
        case 'Escape': setSel({ r1: r, c1: c, r2: r, c2: c }); break;
        default:
          if (e.key.length === 1 && !mod && !e.altKey) {
            e.preventDefault();
            startEdit(r, c, e.key);
          }
      }
    },
    [sheet, editing, active, activeKey, activeStyle, moveTo, select, startEdit, clearContents, applyStyle, undo, redo, growIfNeeded],
  );

  /* ── import / export ── */

  const exportXlsx = useCallback(() => {
    if (!doc) return;
    const wb = XLSX.utils.book_new();
    for (const s of doc.sheets) {
      let maxR = 0;
      let maxC = 0;
      for (const key of Object.keys(s.cells)) {
        const p = parseRef(key);
        if (!p || !(s.cells[key].v ?? '')) continue;
        maxR = Math.max(maxR, p.r);
        maxC = Math.max(maxC, p.c);
      }
      const ws: XLSX.WorkSheet = {};
      const vals = computeValues(s.cells);
      for (const [key, cell] of Object.entries(s.cells)) {
        const raw = cell.v ?? '';
        if (!raw) continue;
        const v = valueAt(vals, s.cells, key);
        if (raw.startsWith('=')) {
          ws[key] = { t: typeof v === 'number' ? 'n' : 's', v: typeof v === 'number' ? v : toStr(v), f: raw.slice(1) };
        } else if (typeof v === 'number') {
          ws[key] = { t: 'n', v };
        } else if (typeof v === 'boolean') {
          ws[key] = { t: 'b', v };
        } else {
          ws[key] = { t: 's', v: toStr(v) };
        }
      }
      ws['!ref'] = `A1:${colName(maxC)}${maxR + 1}`;
      ws['!cols'] = Array.from({ length: maxC + 1 }, (_, c) => ({ wpx: s.colW[c] ?? DEFAULT_COL_W }));
      XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
    }
    XLSX.writeFile(wb, `Sheets_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }, [doc]);

  const importFile = useCallback(
    async (file: File) => {
      if (!doc) return;
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const imported: Sheet[] = wb.SheetNames.map((name) => {
        const ws = wb.Sheets[name];
        const next = makeSheet(name);
        const ref = ws['!ref'];
        if (!ref) return next;
        const dim = XLSX.utils.decode_range(ref);
        next.rows = Math.max(DEFAULT_ROWS, dim.e.r + 5);
        next.cols = Math.max(DEFAULT_COLS, dim.e.c + 3);
        for (let r = dim.s.r; r <= dim.e.r; r++) {
          for (let c = dim.s.c; c <= dim.e.c; c++) {
            const key = cellKey(r, c);
            const cell = ws[key] as XLSX.CellObject | undefined;
            if (!cell) continue;
            const raw = cell.f ? `=${cell.f}` : cell.v === undefined ? '' : String(cell.v);
            if (raw !== '') next.cells[key] = { v: raw };
          }
        }
        (ws['!cols'] ?? []).forEach((col, c) => {
          if (col?.wpx) next.colW[c] = Math.round(col.wpx);
        });
        return next;
      });
      if (!imported.length) return;
      apply({ ...doc, sheets: [...doc.sheets, ...imported], activeId: imported[0].id });
      setSel({ r1: 0, c1: 0, r2: 0, c2: 0 });
      setActive({ r: 0, c: 0 });
    },
    [doc, apply],
  );

  /* ── sheet tabs ── */

  const addSheet = () => {
    if (!doc) return;
    let n = doc.sheets.length + 1;
    const names = new Set(doc.sheets.map((s) => s.name));
    while (names.has(`Sheet${n}`)) n++;
    const next = makeSheet(`Sheet${n}`);
    apply({ sheets: [...doc.sheets, next], activeId: next.id });
    setSel({ r1: 0, c1: 0, r2: 0, c2: 0 });
    setActive({ r: 0, c: 0 });
  };

  const removeSheet = (id: string) => {
    if (!doc || doc.sheets.length < 2) return;
    const rest = doc.sheets.filter((s) => s.id !== id);
    apply({ sheets: rest, activeId: doc.activeId === id ? rest[0].id : doc.activeId });
    setDeleteTarget(null);
  };

  const commitRename = () => {
    if (!doc || !renaming) return;
    const name = renaming.name.trim().slice(0, 40);
    if (name) apply({ ...doc, sheets: doc.sheets.map((s) => (s.id === renaming.id ? { ...s, name } : s)) });
    setRenaming(null);
  };

  const gotoNameBox = () => {
    if (!sheet) return;
    const parts = nameBox.trim().toUpperCase().split(':');
    const a = parseRef(parts[0]);
    if (!a) {
      setNameBox(rangeLabel(sel));
      return;
    }
    const b = parts[1] ? parseRef(parts[1]) : a;
    const target = {
      r1: Math.min(a.r, sheet.rows - 1),
      c1: Math.min(a.c, sheet.cols - 1),
      r2: Math.min((b ?? a).r, sheet.rows - 1),
      c2: Math.min((b ?? a).c, sheet.cols - 1),
    };
    select(target, { r: target.r1, c: target.c1 });
    gridRef.current?.focus();
  };

  /* ── status bar numbers ── */

  const stats = useMemo(() => {
    if (!sheet) return { count: 0, numeric: 0, sum: 0 };
    let count = 0;
    let numeric = 0;
    let sum = 0;
    forEachCell(sel, (r, c) => {
      const key = cellKey(r, c);
      if (!(sheet.cells[key]?.v ?? '')) return;
      count++;
      const v = valueAt(values, sheet.cells, key);
      if (typeof v === 'number') {
        numeric++;
        sum += v;
      }
    });
    return { count, numeric, sum };
  }, [sheet, sel, values]);

  /* ── formula bar text ── */

  const formulaText = editing ? editing.value : (activeCell?.v ?? '');

  if (!doc || !sheet) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileSpreadsheet className="h-4 w-4 animate-pulse" />
          Loading sheet…
        </div>
      </div>
    );
  }

  const body = (
    <div
      className={`flex flex-col overflow-hidden bg-card ${
        fullscreen
          ? 'h-full rounded-none border-0'
          : 'h-[72dvh] min-h-[26rem] rounded-xl border border-border shadow-sm sm:h-[calc(100dvh-17rem)] sm:min-h-[28rem]'
      }`}
    >
      <SheetToolbar
        style={activeStyle}
        onStyle={applyStyle}
        onClearFormat={clearFormat}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        onInsertRow={insertRow}
        onDeleteRow={removeRow}
        onInsertCol={insertCol}
        onDeleteCol={removeCol}
        onExport={exportXlsx}
        onImport={importFile}
        fullscreen={fullscreen}
        onToggleFullscreen={() => setFullscreen((f) => !f)}
      />

      {/* Name box + formula bar */}
      <div className="flex items-stretch gap-2 border-b border-border bg-card px-2 py-1.5">
        <input
          value={nameBox}
          onChange={(e) => setNameBox(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') gotoNameBox();
            if (e.key === 'Escape') setNameBox(rangeLabel(sel));
          }}
          onBlur={() => setNameBox(rangeLabel(sel))}
          aria-label="Cell reference"
          className="h-8 w-[74px] shrink-0 rounded-md border border-border bg-background px-1.5 text-center text-xs font-semibold outline-none focus:ring-2 focus:ring-ring/40 sm:h-7 sm:w-[92px] sm:px-2"
        />
        <span className="hidden w-6 shrink-0 items-center justify-center font-serif text-sm text-muted-foreground italic sm:flex">
          fx
        </span>
        <input
          value={formulaText}
          onChange={(e) => {
            if (editing) setEditing({ ...editing, value: e.target.value });
            else setEditing({ r: active.r, c: active.c, value: e.target.value, caretAtEnd: true, fromBar: true });
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitEdit('down');
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancelEdit();
            }
          }}
          placeholder="Value, or = for a formula"
          aria-label="Formula bar"
          className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 font-mono text-xs outline-none focus:ring-2 focus:ring-ring/40 sm:h-7"
        />
      </div>

      <SheetGrid
        sheet={sheet}
        values={values}
        sel={sel}
        active={active}
        editing={editing?.fromBar ? null : editing}
        onSelect={select}
        onStartEdit={(r, c) => startEdit(r, c)}
        onEditValue={(v) => setEditing((e) => (e ? { ...e, value: v } : e))}
        onCommitEdit={commitEdit}
        onCancelEdit={cancelEdit}
        onResizeCol={(c, w) => editSheetQuiet((s) => ({ ...s, colW: { ...s.colW, [c]: w } }))}
        onResizeRow={(r, h) => editSheetQuiet((s) => ({ ...s, rowH: { ...s.rowH, [r]: h } }))}
        onFill={fill}
        onKeyDown={onKeyDown}
        touch={isTouch}
        containerRef={gridRef}
      />

      {/* Sheet tabs */}
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-t border-border bg-card px-2 py-1.5 [scrollbar-width:thin] sm:py-1">
        {doc.sheets.map((s) => {
          const isActive = s.id === sheet.id;
          if (renaming?.id === s.id) {
            return (
              <input
                key={s.id}
                autoFocus
                value={renaming.name}
                onChange={(e) => setRenaming({ id: s.id, name: e.target.value })}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') setRenaming(null);
                }}
                className="h-7 w-28 shrink-0 rounded-md border border-border bg-background px-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-ring/40"
              />
            );
          }
          return (
            <div
              key={s.id}
              onClick={() => {
                if (isActive) return;
                setDoc({ ...doc, activeId: s.id });
                setSel({ r1: 0, c1: 0, r2: 0, c2: 0 });
                setActive({ r: 0, c: 0 });
                setEditing(null);
              }}
              onDoubleClick={() => setRenaming({ id: s.id, name: s.name })}
              title={isActive ? 'Double-click to rename' : s.name}
              className={`group flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md px-2.5 text-xs font-semibold transition-colors ${
                isActive
                  ? 'bg-secondary/25 text-foreground ring-1 ring-secondary/50'
                  : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {s.name}
              {doc.sheets.length > 1 && (
                <button
                  type="button"
                  aria-label={`Delete ${s.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (Object.keys(s.cells).length === 0) removeSheet(s.id);
                    else setDeleteTarget(s.id);
                  }}
                  className="rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-60 hover:!opacity-100 hover:bg-destructive/15"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}
        <button
          type="button"
          onClick={addSheet}
          title="Add sheet"
          aria-label="Add sheet"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Status bar */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground sm:py-1">
        <span className="font-medium">
          {rangeLabel(sel)}
          {stats.count > 0 && ` · ${stats.count} filled`}
        </span>
        <span className="flex items-center gap-3 tabular-nums">
          {stats.numeric > 0 && (
            <>
              <span>Sum: {formatValue(stats.sum)}</span>
              <span>Avg: {formatValue(Number((stats.sum / stats.numeric).toPrecision(12)))}</span>
              <span>Count: {stats.numeric}</span>
            </>
          )}
          <span
            className={`flex items-center gap-1 ${
              saveState === 'offline' ? 'text-destructive' : saveState === 'saving' ? 'text-secondary' : 'text-muted-foreground'
            }`}
            title={
              saveState === 'offline'
                ? 'Could not reach the server. Your work is safe on this device and will sync automatically.'
                : undefined
            }
          >
            {saveState === 'saved' && <Check className="h-3 w-3" />}
            {saveState === 'offline' && <CloudOff className="h-3 w-3" />}
            {saveState === 'saved' ? 'Saved' : saveState === 'saving' ? 'Saving…' : 'Offline'}
          </span>
        </span>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {!fullscreen && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl">
              <FileSpreadsheet className="h-5 w-5 text-secondary sm:h-6 sm:w-6" />
              Sheets
            </h1>
            <p className="mt-1 hidden text-sm text-muted-foreground sm:block">
              A free-form scratchpad for notes and quick sums. Saved to your account — it is not
              connected to clients, loans or any other records.
            </p>
          </div>
          <p className="hidden text-xs text-muted-foreground sm:block">
            Double-click a cell to edit · start with <span className="font-mono font-semibold">=</span> for a formula
          </p>
          <p className="text-xs text-muted-foreground sm:hidden">
            Tap to select, tap again to edit
          </p>
        </div>
      )}

      {fullscreen ? (
        <div
          className="fixed inset-0 z-50 bg-background"
          style={{
            paddingTop: 'env(safe-area-inset-top)',
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
        >
          {body}
        </div>
      ) : (
        body
      )}

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete this sheet?</AlertDialogTitle>
          <AlertDialogDescription>
            “{doc.sheets.find((s) => s.id === deleteTarget)?.name}” and everything on it will be removed.
            You can undo this with Ctrl+Z.
          </AlertDialogDescription>
          <div className="mt-4 flex justify-end gap-2">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && removeSheet(deleteTarget)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
