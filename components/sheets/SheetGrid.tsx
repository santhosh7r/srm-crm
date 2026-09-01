'use client';

import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  cellKey, colName, DEFAULT_COL_W, DEFAULT_ROW_H, formatValue, HEAD_W, isErr,
  normRange, valueAt,
} from '@/lib/sheets/engine';
import type { CellStyle, Range, Sheet, Value } from '@/lib/sheets/engine';

const HEAD_H = 26;
const MIN_COL_W = 28;
const MIN_ROW_H = 18;

/** How close to the edge a drag must get before the grid starts scrolling itself. */
const EDGE = 48;
const EDGE_STEP = 16;
/** A touch that moves further than this is a scroll, not a tap. */
const TAP_SLOP = 10;

type Box = { x: number; y: number; w: number; h: number };
type Hit = { r: number | null; c: number | null };

/* ─────────────────────────────── cell ────────────────────────────── */

interface CellProps {
  r: number;
  c: number;
  text: string;
  isError: boolean;
  numeric: boolean;
  style?: CellStyle;
  inRange: boolean;
  height: number;
  /** Width the text may spill across into empty neighbours (0 = clip at the cell edge). */
  spill: number;
  blank: boolean;
}

const CellView = memo(function CellView({
  r, c, text, isError, numeric, style, inRange, height, spill, blank,
}: CellProps) {
  const align = style?.align ?? (numeric ? 'right' : 'left');
  const justify = align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start';

  return (
    <td
      data-r={r}
      data-c={c}
      style={{ height, background: style?.bg, overflow: spill > 0 ? 'visible' : 'hidden' }}
      className={`relative cursor-cell border-r border-b border-[var(--sheet-line)] p-0 align-middle ${
        inRange ? 'bg-[var(--sheet-sel)]' : ''
      }`}
    >
      {!blank && (
        <div
          style={{
            justifyContent: justify,
            width: spill > 0 ? spill : undefined,
            color: isError ? 'var(--sheet-err)' : style?.color,
            fontSize: style?.size ? `${style.size}px` : undefined,
            fontWeight: style?.bold ? 700 : undefined,
            fontStyle: style?.italic ? 'italic' : undefined,
            textDecoration:
              style?.underline && style?.strike
                ? 'underline line-through'
                : style?.underline
                  ? 'underline'
                  : style?.strike
                    ? 'line-through'
                    : undefined,
          }}
          className={`pointer-events-none flex h-full px-[5px] leading-tight ${
            style?.wrap
              ? 'items-start py-[4px] break-words whitespace-pre-wrap'
              : 'items-center overflow-hidden whitespace-pre'
          }`}
        >
          {text}
        </div>
      )}
    </td>
  );
});

/* ─────────────────────────────── grid ────────────────────────────── */

export interface GridProps {
  sheet: Sheet;
  values: Map<string, Value>;
  sel: Range;
  active: { r: number; c: number };
  editing: { r: number; c: number; value: string; caretAtEnd: boolean } | null;
  onSelect: (sel: Range, active?: { r: number; c: number }) => void;
  onStartEdit: (r: number, c: number) => void;
  onEditValue: (v: string) => void;
  onCommitEdit: (move: 'down' | 'right' | 'up' | 'left' | 'none') => void;
  onCancelEdit: () => void;
  onResizeCol: (c: number, w: number) => void;
  onResizeRow: (r: number, h: number) => void;
  onFill: (target: Range) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  /** Coarse-pointer device: tap to select, tap again to edit, drag the handles to extend or fill. */
  touch: boolean;
  /**
   * Filled in with a "fit this column to its contents" function. Only the grid can
   * measure rendered text, but the toolbar needs to offer it — a double-click on a
   * 22px divider is not something you can ask of a thumb.
   */
  fitColRef?: React.RefObject<((c: number) => void) | null>;
  /**
   * The offscreen textarea that holds focus. Chrome only fires copy/cut/paste at
   * an editable element, so keyboard and clipboard both live here rather than on
   * the scroll container.
   */
  containerRef: React.RefObject<HTMLTextAreaElement | null>;
}

export function SheetGrid(props: GridProps) {
  const { sheet, values, sel, active, editing, touch } = props;

  // Callbacks change identity every render; window listeners read them through a ref.
  const cb = useRef(props);
  cb.current = props;

  const scrollRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  // Live size while a divider is dragged — local so the page doesn't re-render per pointermove.
  const [drag, setDrag] = useState<{ kind: 'col' | 'row'; index: number; size: number } | null>(null);
  const [fillTo, setFillTo] = useState<Range | null>(null);

  const mode = useRef<'none' | 'cell' | 'col' | 'row' | 'fill' | 'resize'>('none');
  const origin = useRef({ r: 0, c: 0 });
  const resize = useRef<{ kind: 'col' | 'row'; index: number; from: number; size: number } | null>(null);
  const dragSize = useRef<{ kind: 'col' | 'row'; index: number; size: number } | null>(null);
  const fillRef = useRef<Range | null>(null);

  /** A touch that has gone down but not yet been decided as a tap or a scroll. */
  const tap = useRef<{ r: number; c: number; kind: 'cell' | 'col' | 'row'; x: number; y: number } | null>(null);
  /** Last pointer position, so edge auto-scroll can keep extending without pointer movement. */
  const point = useRef({ x: 0, y: 0 });
  /** Where the current drag began, so a stationary press never triggers auto-scroll. */
  const dragFrom = useRef({ x: 0, y: 0 });
  const edgeDir = useRef({ dx: 0, dy: 0 });
  const scroller = useRef<number | null>(null);

  const colW = (c: number) =>
    drag?.kind === 'col' && drag.index === c ? drag.size : (sheet.colW[c] ?? DEFAULT_COL_W);
  const rowH = (r: number) =>
    drag?.kind === 'row' && drag.index === r ? drag.size : (sheet.rowH[r] ?? DEFAULT_ROW_H);

  const n = normRange(sel);
  const fillBox = fillTo ? normRange(fillTo) : null;

  /* ── overlay geometry, measured from the DOM so wrapped rows stay accurate ── */

  const [rects, setRects] = useState<{ sel: Box; active: Box; fill?: Box } | null>(null);

  const measure = useCallback((r1: number, c1: number, r2: number, c2: number): Box | null => {
    const root = wrapRef.current;
    if (!root) return null;
    const a = root.querySelector<HTMLElement>(`td[data-r="${r1}"][data-c="${c1}"]`);
    const b = root.querySelector<HTMLElement>(`td[data-r="${r2}"][data-c="${c2}"]`);
    if (!a || !b) return null;
    const base = root.getBoundingClientRect();
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    return {
      x: ra.left - base.left,
      y: ra.top - base.top,
      w: rb.right - ra.left,
      h: rb.bottom - ra.top,
    };
  }, []);

  useLayoutEffect(() => {
    const s = measure(n.r1, n.c1, n.r2, n.c2);
    const a = measure(active.r, active.c, active.r, active.c);
    if (!s || !a) {
      setRects(null);
      return;
    }
    const f = fillBox ? measure(fillBox.r1, fillBox.c1, fillBox.r2, fillBox.c2) : null;
    setRects({ sel: s, active: a, fill: f ?? undefined });
  }, [
    measure, sheet, drag,
    n.r1, n.c1, n.r2, n.c2, active.r, active.c,
    fillBox?.r1, fillBox?.c1, fillBox?.r2, fillBox?.c2,
  ]);

  /* ── keep the active cell on screen ── */

  useEffect(() => {
    const box = scrollRef.current;
    const root = wrapRef.current;
    if (!box || !root) return;
    const el = root.querySelector<HTMLElement>(`td[data-r="${active.r}"][data-c="${active.c}"]`);
    if (!el) return;

    const base = root.getBoundingClientRect();
    const rc = el.getBoundingClientRect();
    const left = rc.left - base.left;
    const top = rc.top - base.top;

    if (left - HEAD_W < box.scrollLeft) box.scrollLeft = Math.max(0, left - HEAD_W);
    else if (left + rc.width > box.scrollLeft + box.clientWidth) {
      box.scrollLeft = left + rc.width - box.clientWidth;
    }
    if (top - HEAD_H < box.scrollTop) box.scrollTop = Math.max(0, top - HEAD_H);
    else if (top + rc.height > box.scrollTop + box.clientHeight) {
      box.scrollTop = top + rc.height - box.clientHeight;
    }
  }, [active.r, active.c]);

  /* ── focus the inline editor when it opens ── */

  const editKey = editing ? `${editing.r}:${editing.c}` : null;
  useEffect(() => {
    if (!editKey) return;
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    if (cb.current.editing?.caretAtEnd) el.setSelectionRange(el.value.length, el.value.length);
    else el.select();
    // The on-screen keyboard covers the lower half of a phone — make sure the
    // cell being typed into is still somewhere the user can see it.
    if (cb.current.touch) {
      window.setTimeout(() => el.scrollIntoView({ block: 'nearest', inline: 'nearest' }), 250);
    }
  }, [editKey]);

  /**
   * Mouse only: stop the browser handing focus back to <body>, which would strip
   * the grid of its keyboard and clipboard events. Done on mousedown rather than
   * pointerdown so the compatibility click / dblclick events still fire.
   */
  const keepFocus = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  const focusGrid = () => {
    // Focusing the hidden textarea pops the on-screen keyboard, so on touch we
    // only take focus once the user is actually editing a cell.
    if (cb.current.touch) return;
    cb.current.containerRef.current?.focus();
  };

  /**
   * Row / column under a viewport point — over body cells and over headers alike.
   * Walks the whole hit stack rather than just the top element, because the drag
   * handles sit directly over the cells a drag is trying to reach.
   */
  const hitAt = (x: number, y: number): Hit | null => {
    const root = wrapRef.current;
    if (!root) return null;
    for (const el of document.elementsFromPoint(x, y)) {
      const target = (el as HTMLElement).closest<HTMLElement>('[data-r],[data-c]');
      if (target && root.contains(target)) {
        return {
          r: target.dataset.r !== undefined ? Number(target.dataset.r) : null,
          c: target.dataset.c !== undefined ? Number(target.dataset.c) : null,
        };
      }
    }
    return null;
  };

  /** Extend the current drag to the given cell. */
  const extendTo = (hit: Hit) => {
    const o = origin.current;
    const r = hit.r ?? o.r;
    const c = hit.c ?? o.c;

    if (mode.current === 'cell') {
      props.onSelect({ r1: o.r, c1: o.c, r2: r, c2: c }, o);
    } else if (mode.current === 'col') {
      props.onSelect({ r1: 0, c1: o.c, r2: sheet.rows - 1, c2: c }, { r: 0, c: o.c });
    } else if (mode.current === 'row') {
      props.onSelect({ r1: o.r, c1: 0, r2: r, c2: sheet.cols - 1 }, { r: o.r, c: 0 });
    } else if (mode.current === 'fill') {
      // Excel extends in one direction only — take whichever the pointer moved further in.
      const down = Math.max(0, r - n.r2) + Math.max(0, n.r1 - r);
      const across = Math.max(0, c - n.c2) + Math.max(0, n.c1 - c);
      let next: Range | null = null;
      if (down !== 0 || across !== 0) {
        next =
          down >= across
            ? { r1: Math.min(n.r1, r), c1: n.c1, r2: Math.max(n.r2, r), c2: n.c2 }
            : { r1: n.r1, c1: Math.min(n.c1, c), r2: n.r2, c2: Math.max(n.c2, c) };
      }
      fillRef.current = next;
      setFillTo(next);
    }
  };

  const extendRef = useRef(extendTo);
  extendRef.current = extendTo;

  const hitRef = useRef(hitAt);
  hitRef.current = hitAt;

  /* ── edge auto-scroll while dragging ── */

  const stopScroller = useCallback(() => {
    if (scroller.current !== null) {
      window.clearInterval(scroller.current);
      scroller.current = null;
    }
    edgeDir.current = { dx: 0, dy: 0 };
  }, []);

  const updateEdgeScroll = useCallback(() => {
    const box = scrollRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    const { x, y } = point.current;
    const dx = x < rect.left + EDGE ? -EDGE_STEP : x > rect.right - EDGE ? EDGE_STEP : 0;
    const dy = y < rect.top + EDGE ? -EDGE_STEP : y > rect.bottom - EDGE ? EDGE_STEP : 0;
    edgeDir.current = { dx, dy };

    if (!dx && !dy) {
      if (scroller.current !== null) {
        window.clearInterval(scroller.current);
        scroller.current = null;
      }
      return;
    }
    if (scroller.current !== null) return;
    scroller.current = window.setInterval(() => {
      const b = scrollRef.current;
      if (!b) return;
      b.scrollLeft += edgeDir.current.dx;
      b.scrollTop += edgeDir.current.dy;
      const hit = hitRef.current(point.current.x, point.current.y);
      if (hit) extendRef.current(hit);
    }, 60);
  }, []);

  /* ── global drag handling (one path for mouse, touch and pen) ── */

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (mode.current === 'none') return;

      if (mode.current === 'resize') {
        const rz = resize.current;
        if (!rz) return;
        const delta = (rz.kind === 'col' ? e.clientX : e.clientY) - rz.from;
        const min = rz.kind === 'col' ? MIN_COL_W : MIN_ROW_H;
        const next = { kind: rz.kind, index: rz.index, size: Math.max(min, Math.round(rz.size + delta)) };
        dragSize.current = next;
        setDrag(next);
        return;
      }

      point.current = { x: e.clientX, y: e.clientY };
      const hit = hitRef.current(e.clientX, e.clientY);
      if (hit) extendRef.current(hit);
      // A press that has not travelled yet must not drag the grid out from under it.
      const moved =
        Math.abs(e.clientX - dragFrom.current.x) + Math.abs(e.clientY - dragFrom.current.y) > 12;
      if (moved) updateEdgeScroll();
      else stopScroller();
    };

    const finish = (commit: boolean) => {
      if (mode.current === 'resize') {
        const d = dragSize.current;
        if (commit && d) {
          if (d.kind === 'col') cb.current.onResizeCol(d.index, d.size);
          else cb.current.onResizeRow(d.index, d.size);
        }
        dragSize.current = null;
        resize.current = null;
        setDrag(null);
      } else if (mode.current === 'fill') {
        const t = fillRef.current;
        if (commit && t) cb.current.onFill(normRange(t));
        fillRef.current = null;
        setFillTo(null);
      }
      mode.current = 'none';
      stopScroller();
    };

    const up = (e: PointerEvent) => {
      // A pending touch is only a tap if it never travelled far enough to be a scroll.
      if (e.pointerType !== 'mouse') resolveTapRef.current(e.clientX, e.clientY);
      finish(true);
    };
    const cancel = () => {
      tap.current = null;
      // A cancelled resize or fill should leave the sheet untouched.
      finish(mode.current !== 'resize' && mode.current !== 'fill');
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      stopScroller();
    };
  }, [stopScroller, updateEdgeScroll]);

  /* ── body ── */

  const bodyPos = (e: React.PointerEvent): { r: number; c: number } | null => {
    const td = (e.target as HTMLElement).closest<HTMLElement>('td[data-r]');
    if (!td) return null;
    return { r: Number(td.dataset.r), c: Number(td.dataset.c) };
  };

  const onBodyPointerDown = (e: React.PointerEvent) => {
    const pos = bodyPos(e);
    if (!pos) return;

    if (e.pointerType !== 'mouse') {
      // Let the browser own the gesture — it is a scroll until proven otherwise
      // by a pointerup that has not moved far.
      tap.current = { ...pos, kind: 'cell', x: e.clientX, y: e.clientY };
      return;
    }
    if (e.button !== 0) return;
    focusGrid();
    if (editing) props.onCommitEdit('none');
    point.current = { x: e.clientX, y: e.clientY };
    dragFrom.current = { x: e.clientX, y: e.clientY };
    if (e.shiftKey) {
      props.onSelect({ r1: active.r, c1: active.c, r2: pos.r, c2: pos.c });
    } else {
      origin.current = pos;
      props.onSelect({ r1: pos.r, c1: pos.c, r2: pos.r, c2: pos.c }, pos);
    }
    mode.current = 'cell';
  };

  const onBodyDoubleClick = (e: React.MouseEvent) => {
    const td = (e.target as HTMLElement).closest<HTMLElement>('td[data-r]');
    if (td) props.onStartEdit(Number(td.dataset.r), Number(td.dataset.c));
  };

  /* ── headers ── */

  const selectCol = (c: number, extend: boolean) => {
    if (editing) props.onCommitEdit('none');
    if (extend) props.onSelect({ r1: 0, c1: active.c, r2: sheet.rows - 1, c2: c });
    else props.onSelect({ r1: 0, c1: c, r2: sheet.rows - 1, c2: c }, { r: 0, c });
  };

  const selectRow = (r: number, extend: boolean) => {
    if (editing) props.onCommitEdit('none');
    if (extend) props.onSelect({ r1: active.r, c1: 0, r2: r, c2: sheet.cols - 1 });
    else props.onSelect({ r1: r, c1: 0, r2: r, c2: sheet.cols - 1 }, { r, c: 0 });
  };

  const onHeadPointerDown = (e: React.PointerEvent, kind: 'col' | 'row', index: number) => {
    if (e.pointerType !== 'mouse') {
      tap.current = { r: index, c: index, kind, x: e.clientX, y: e.clientY };
      return;
    }
    if (e.button !== 0) return;
    focusGrid();
    point.current = { x: e.clientX, y: e.clientY };
    dragFrom.current = { x: e.clientX, y: e.clientY };
    origin.current = kind === 'col' ? { r: 0, c: index } : { r: index, c: 0 };
    mode.current = kind;
    if (kind === 'col') selectCol(index, e.shiftKey);
    else selectRow(index, e.shiftKey);
  };

  /**
   * Settle a touch that has been waiting to see whether it was a tap or a scroll.
   * Lives on the window rather than on the cell so a finger that drifts onto one
   * of the overlays before lifting still counts.
   */
  const resolveTap = (x: number, y: number) => {
    const t = tap.current;
    tap.current = null;
    if (!t) return;
    if (Math.abs(x - t.x) > TAP_SLOP || Math.abs(y - t.y) > TAP_SLOP) return;

    if (t.kind === 'col') {
      selectCol(t.c, false);
      return;
    }
    if (t.kind === 'row') {
      selectRow(t.r, false);
      return;
    }
    if (editing) props.onCommitEdit('none');
    if (t.r === active.r && t.c === active.c) {
      // Second tap on the selected cell opens the editor — double-tap is unreliable.
      props.onStartEdit(t.r, t.c);
      return;
    }
    origin.current = { r: t.r, c: t.c };
    props.onSelect({ r1: t.r, c1: t.c, r2: t.r, c2: t.c }, { r: t.r, c: t.c });
  };

  const resolveTapRef = useRef(resolveTap);
  resolveTapRef.current = resolveTap;

  const startResize = (e: React.PointerEvent, kind: 'col' | 'row', index: number) => {
    if (e.pointerType !== 'mouse') e.preventDefault();
    e.stopPropagation();
    tap.current = null;
    mode.current = 'resize';
    const size = kind === 'col' ? colW(index) : rowH(index);
    resize.current = { kind, index, from: kind === 'col' ? e.clientX : e.clientY, size };
    dragSize.current = { kind, index, size };
    setDrag({ kind, index, size });
  };

  /* ── selection handles ── */

  const startHandle = (e: React.PointerEvent, kind: 'fill' | 'topLeft' | 'bottomRight') => {
    if (e.pointerType !== 'mouse') e.preventDefault();
    e.stopPropagation();
    tap.current = null;
    focusGrid();
    point.current = { x: e.clientX, y: e.clientY };
    dragFrom.current = { x: e.clientX, y: e.clientY };
    if (kind === 'fill') {
      mode.current = 'fill';
      fillRef.current = null;
      setFillTo(null);
    } else {
      mode.current = 'cell';
      // Anchor on the opposite corner so the dragged corner is the one that moves.
      origin.current = kind === 'topLeft' ? { r: n.r2, c: n.c2 } : { r: n.r1, c: n.c1 };
    }
  };

  /**
   * Widen a column to its longest entry. Measured with a Range over the rendered
   * text, because the cell's own box is either clipped or stretched by spill and
   * so says nothing about how wide the content really is.
   */
  const autoFitCol = (c: number) => {
    const root = wrapRef.current;
    if (!root) return;
    const range = document.createRange();
    let widest = 0;
    root.querySelectorAll<HTMLElement>(`td[data-c="${c}"] > div`).forEach((el) => {
      range.selectNodeContents(el);
      widest = Math.max(widest, range.getBoundingClientRect().width);
    });
    // Nothing to fit — collapsing an empty column to 28px only makes it unusable.
    props.onResizeCol(c, widest === 0 ? DEFAULT_COL_W : Math.max(MIN_COL_W, Math.min(480, Math.ceil(widest) + 14)));
  };

  if (props.fitColRef) props.fitColRef.current = autoFitCol;

  const cols = Array.from({ length: sheet.cols }, (_, i) => i);
  const totalW = HEAD_W + cols.reduce((sum, c) => sum + colW(c), 0);
  // The neighbouring header paints over anything past the divider, so a grip has to
  // reach back into its own header to stay hittable — especially with a finger.
  // Columns can afford a wide strip; a row is only ~26px tall, and a fat grip there
  // would swallow the tap that selects the row.
  const colGrip = touch ? 24 : 13;
  const rowGrip = touch ? 11 : 9;
  const gripOut = touch ? 5 : 6;

  return (
    <div
      ref={scrollRef}
      style={{ WebkitTouchCallout: 'none', overscrollBehavior: 'contain' }}
      className="relative flex-1 touch-pan-x touch-pan-y overflow-auto bg-[var(--sheet-bg)] outline-none select-none"
    >
      <div ref={wrapRef} className="relative w-max">
        <table
          className="border-collapse text-[12px]"
          style={{ width: totalW, tableLayout: 'fixed' }}
          onMouseDown={keepFocus}
          onPointerDown={onBodyPointerDown}
          onDoubleClick={onBodyDoubleClick}
        >
          <colgroup>
            <col style={{ width: HEAD_W }} />
            {cols.map((c) => (
              <col key={c} style={{ width: colW(c) }} />
            ))}
          </colgroup>

          <thead>
            <tr style={{ height: HEAD_H }}>
              <th
                onClick={() => {
                  focusGrid();
                  props.onSelect({ r1: 0, c1: 0, r2: sheet.rows - 1, c2: sheet.cols - 1 }, { r: 0, c: 0 });
                }}
                title="Select all"
                className="sticky top-0 left-0 z-30 cursor-pointer border-r border-b border-[var(--sheet-line)] bg-[var(--sheet-head)] p-0"
              />
              {cols.map((c) => {
                const on = c >= n.c1 && c <= n.c2;
                return (
                  <th
                    key={c}
                    data-c={c}
                    onPointerDown={(e) => onHeadPointerDown(e, 'col', c)}
                    className={`sticky top-0 z-20 border-r border-b border-[var(--sheet-line)] p-0 text-[11px] font-semibold ${
                      on
                        ? 'bg-[var(--sheet-head-on)] text-foreground'
                        : 'bg-[var(--sheet-head)] text-muted-foreground'
                    }`}
                  >
                    <div className="flex h-full cursor-pointer items-center justify-center">
                      {colName(c)}
                    </div>
                    <span
                      onMouseDown={keepFocus}
                      onPointerDown={(e) => startResize(e, 'col', c)}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        autoFitCol(c);
                      }}
                      title="Drag to resize · double-click to fit the contents"
                      style={{ width: colGrip, right: -gripOut, touchAction: 'none' }}
                      className="group/grip absolute top-0 bottom-0 z-10 flex cursor-col-resize justify-center"
                    >
                      <span
                        className={`h-full w-[3px] rounded-full transition-colors ${
                          drag?.kind === 'col' && drag.index === c
                            ? 'bg-[var(--sheet-accent)]'
                            : 'bg-transparent group-hover/grip:bg-[var(--sheet-accent)]'
                        }`}
                      />
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {Array.from({ length: sheet.rows }, (_, r) => {
              const on = r >= n.r1 && r <= n.r2;
              return (
                <tr key={r} style={{ height: rowH(r) }}>
                  <th
                    data-r={r}
                    onPointerDown={(e) => onHeadPointerDown(e, 'row', r)}
                    className={`sticky left-0 z-10 border-r border-b border-[var(--sheet-line)] p-0 text-[11px] font-semibold ${
                      on
                        ? 'bg-[var(--sheet-head-on)] text-foreground'
                        : 'bg-[var(--sheet-head)] text-muted-foreground'
                    }`}
                  >
                    <div className="flex h-full cursor-pointer items-center justify-center">
                      {r + 1}
                    </div>
                    <span
                      onMouseDown={keepFocus}
                      onPointerDown={(e) => startResize(e, 'row', r)}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        props.onResizeRow(r, DEFAULT_ROW_H);
                      }}
                      title="Drag to resize · double-click to reset"
                      style={{ height: rowGrip, bottom: -gripOut, touchAction: 'none' }}
                      className="absolute right-0 left-0 z-10 cursor-row-resize hover:bg-[var(--sheet-accent)]"
                    />
                  </th>

                  {cols.map((c) => {
                    const key = cellKey(r, c);
                    const cell = sheet.cells[key];
                    const v = valueAt(values, sheet.cells, key);
                    const style = cell?.s;
                    const text = formatValue(v, style?.fmt);

                    // Long text runs into empty neighbours, the way Excel does.
                    let spill = 0;
                    if (
                      text.length > 0 &&
                      typeof v === 'string' &&
                      !style?.wrap &&
                      (style?.align ?? 'left') === 'left'
                    ) {
                      let width = colW(c);
                      for (let k = c + 1; k < sheet.cols; k++) {
                        if ((sheet.cells[cellKey(r, k)]?.v ?? '') !== '') break;
                        width += colW(k);
                      }
                      if (width > colW(c)) spill = width;
                    }

                    return (
                      <CellView
                        key={c}
                        r={r}
                        c={c}
                        text={text}
                        isError={isErr(v)}
                        numeric={typeof v === 'number'}
                        style={style}
                        inRange={
                          r >= n.r1 && r <= n.r2 && c >= n.c1 && c <= n.c2 &&
                          !(r === active.r && c === active.c)
                        }
                        height={rowH(r)}
                        spill={spill}
                        blank={!!editing && editing.r === r && editing.c === c}
                      />
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>

        {rects && (
          <>
            <div
              className="pointer-events-none absolute z-[5] border-2 border-[var(--sheet-accent)]"
              style={{ left: rects.sel.x, top: rects.sel.y, width: rects.sel.w, height: rects.sel.h }}
            />
            <div
              className="pointer-events-none absolute z-[6] border-2 border-[var(--sheet-accent)]"
              style={{ left: rects.active.x, top: rects.active.y, width: rects.active.w, height: rects.active.h }}
            />
            {rects.fill && (
              <div
                className="pointer-events-none absolute z-[6] border-2 border-dashed border-[var(--sheet-accent)]"
                style={{ left: rects.fill.x, top: rects.fill.y, width: rects.fill.w, height: rects.fill.h }}
              />
            )}

            {!editing && (
              <>
                {/* Touch: round grips on opposite corners grow the selection. */}
                {touch && (
                  <>
                    <div
                      onMouseDown={keepFocus}
                      onPointerDown={(e) => startHandle(e, 'topLeft')}
                      aria-label="Extend selection"
                      style={{
                        left: rects.sel.x - 10,
                        top: rects.sel.y - 10,
                        touchAction: 'none',
                      }}
                      className="absolute z-[7] h-[20px] w-[20px] rounded-full border-2 border-[var(--sheet-bg)] bg-[var(--sheet-accent)] shadow-sm"
                    />
                    <div
                      onMouseDown={keepFocus}
                      onPointerDown={(e) => startHandle(e, 'bottomRight')}
                      aria-label="Extend selection"
                      style={{
                        left: rects.sel.x + rects.sel.w - 10,
                        top: rects.sel.y + rects.sel.h - 10,
                        touchAction: 'none',
                      }}
                      className="absolute z-[7] h-[20px] w-[20px] rounded-full border-2 border-[var(--sheet-bg)] bg-[var(--sheet-accent)] shadow-sm"
                    />
                  </>
                )}

                {/* Fill handle — square, and on touch offset clear of the round grip. */}
                <div
                  onMouseDown={keepFocus}
                  onPointerDown={(e) => startHandle(e, 'fill')}
                  title="Drag to copy the contents"
                  aria-label="Drag to copy the contents"
                  style={{
                    left: rects.sel.x + rects.sel.w + (touch ? 10 : -4),
                    top: rects.sel.y + rects.sel.h + (touch ? 10 : -4),
                    touchAction: 'none',
                  }}
                  className={`absolute z-[7] cursor-crosshair border-2 border-[var(--sheet-bg)] bg-[var(--sheet-accent)] ${
                    touch ? 'h-[18px] w-[18px] rounded-[4px] shadow-sm' : 'h-[8px] w-[8px] rounded-[1px]'
                  }`}
                />
              </>
            )}
          </>
        )}

        <textarea
          ref={props.containerRef}
          value=" "
          onChange={() => {}}
          onKeyDown={(e) => {
            // Chrome only raises copy/cut/paste when the editable target has a
            // live selection, and React resets it on re-render — so re-select
            // the placeholder just before the browser decides.
            if ((e.ctrlKey || e.metaKey) && 'cxv'.includes(e.key.toLowerCase())) {
              e.currentTarget.select();
            }
            props.onKeyDown(e);
          }}
          onFocus={(e) => e.currentTarget.select()}
          tabIndex={0}
          aria-label="Spreadsheet"
          spellCheck={false}
          className="pointer-events-none absolute z-[8] h-px w-px resize-none border-0 bg-transparent p-0 opacity-0 outline-none"
          style={{ left: rects?.active.x ?? 0, top: rects?.active.y ?? 0 }}
        />

        {editing && rects && (
          <textarea
            ref={editorRef}
            value={editing.value}
            onChange={(e) => props.onEditValue(e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onBlur={() => props.onCommitEdit('none')}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter' && e.altKey) {
                // Alt+Enter inserts a line break, same as Excel.
                e.preventDefault();
                const el = e.currentTarget;
                const at = el.selectionStart;
                props.onEditValue(`${editing.value.slice(0, at)}\n${editing.value.slice(el.selectionEnd)}`);
                requestAnimationFrame(() => el.setSelectionRange(at + 1, at + 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                props.onCommitEdit(e.shiftKey ? 'up' : 'down');
              } else if (e.key === 'Tab') {
                e.preventDefault();
                props.onCommitEdit(e.shiftKey ? 'left' : 'right');
              } else if (e.key === 'Escape') {
                e.preventDefault();
                props.onCancelEdit();
              }
            }}
            style={{
              left: rects.active.x,
              top: rects.active.y,
              minWidth: rects.active.w,
              minHeight: rects.active.h,
              // iOS Safari zooms the whole page in on any field under 16px.
              fontSize: touch ? 16 : undefined,
            }}
            className="absolute z-40 resize-none overflow-hidden border-2 border-[var(--sheet-accent)] bg-card px-[4px] py-[3px] text-[12px] leading-tight shadow-md outline-none"
            rows={1}
          />
        )}
      </div>
    </div>
  );
}
