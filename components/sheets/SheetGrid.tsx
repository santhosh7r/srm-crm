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

type Box = { x: number; y: number; w: number; h: number };

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
  /** Coarse-pointer device: tap to select, tap again to edit, drag the handle to extend. */
  touch: boolean;
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

  // Live size while a divider is dragged — local so the page doesn't re-render per mousemove.
  const [drag, setDrag] = useState<{ kind: 'col' | 'row'; index: number; size: number } | null>(null);
  const [fillTo, setFillTo] = useState<Range | null>(null);

  const mode = useRef<'none' | 'cell' | 'col' | 'row' | 'fill' | 'resize'>('none');
  const origin = useRef({ r: 0, c: 0 });
  const resize = useRef<{ kind: 'col' | 'row'; index: number; from: number; size: number } | null>(null);
  const dragSize = useRef<{ kind: 'col' | 'row'; index: number; size: number } | null>(null);
  const fillRef = useRef<Range | null>(null);

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
  }, [editKey]);

  /* ── global drag handling ── */

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (mode.current !== 'resize') return;
      const rz = resize.current;
      if (!rz) return;
      const delta = (rz.kind === 'col' ? e.clientX : e.clientY) - rz.from;
      const min = rz.kind === 'col' ? MIN_COL_W : MIN_ROW_H;
      const next = { kind: rz.kind, index: rz.index, size: Math.max(min, Math.round(rz.size + delta)) };
      dragSize.current = next;
      setDrag(next);
    };

    const up = () => {
      if (mode.current === 'resize') {
        const d = dragSize.current;
        if (d) {
          if (d.kind === 'col') cb.current.onResizeCol(d.index, d.size);
          else cb.current.onResizeRow(d.index, d.size);
        }
        dragSize.current = null;
        resize.current = null;
        setDrag(null);
      } else if (mode.current === 'fill') {
        const t = fillRef.current;
        if (t) cb.current.onFill(normRange(t));
        fillRef.current = null;
        setFillTo(null);
      }
      mode.current = 'none';
    };

    const touchMove = (e: TouchEvent) => {
      if (mode.current === 'none' || mode.current === 'resize') return;
      const t = e.touches[0];
      if (!t) return;
      // Stop the grid from scrolling while a handle drag is in progress.
      e.preventDefault();
      const el = document.elementFromPoint(t.clientX, t.clientY);
      const td = el?.closest<HTMLElement>('td[data-r]');
      if (td) extendRef.current(Number(td.dataset.r), Number(td.dataset.c));
    };

    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('touchmove', touchMove, { passive: false });
    window.addEventListener('touchend', up);
    window.addEventListener('touchcancel', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchmove', touchMove);
      window.removeEventListener('touchend', up);
      window.removeEventListener('touchcancel', up);
    };
  }, []);

  const focusGrid = () => {
    // Focusing the hidden textarea pops the on-screen keyboard, so on touch we
    // only take focus once the user is actually editing a cell.
    if (cb.current.touch) return;
    cb.current.containerRef.current?.focus();
  };

  /** Extend the current drag to the cell under the pointer. */
  const extendTo = (r: number, c: number) => {
    const o = origin.current;
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

  /** One delegated handler for every cell in the body. */
  const bodyPos = (e: React.MouseEvent): { r: number; c: number } | null => {
    const td = (e.target as HTMLElement).closest<HTMLElement>('td[data-r]');
    if (!td) return null;
    return { r: Number(td.dataset.r), c: Number(td.dataset.c) };
  };

  const onBodyMouseDown = (e: React.MouseEvent) => {
    const pos = bodyPos(e);
    if (!pos || e.button !== 0) return;
    // Without this the browser hands focus back to <body> after the handler runs,
    // which would strip the grid of its keyboard and clipboard events.
    e.preventDefault();
    focusGrid();
    if (editing) props.onCommitEdit('none');
    if (e.shiftKey) {
      props.onSelect({ r1: active.r, c1: active.c, r2: pos.r, c2: pos.c });
    } else if (touch && pos.r === active.r && pos.c === active.c) {
      // Second tap on the selected cell opens the editor — double-tap is unreliable.
      props.onStartEdit(pos.r, pos.c);
      return;
    } else {
      origin.current = pos;
      props.onSelect({ r1: pos.r, c1: pos.c, r2: pos.r, c2: pos.c }, pos);
    }
    mode.current = 'cell';
  };

  const onBodyMouseOver = (e: React.MouseEvent) => {
    if (mode.current === 'none' || mode.current === 'resize') return;
    const pos = bodyPos(e);
    if (pos) extendTo(pos.r, pos.c);
  };

  const onBodyDoubleClick = (e: React.MouseEvent) => {
    const pos = bodyPos(e);
    if (pos) props.onStartEdit(pos.r, pos.c);
  };

  const startResize = (e: React.MouseEvent, kind: 'col' | 'row', index: number) => {
    e.preventDefault();
    e.stopPropagation();
    mode.current = 'resize';
    const size = kind === 'col' ? colW(index) : rowH(index);
    resize.current = { kind, index, from: kind === 'col' ? e.clientX : e.clientY, size };
    dragSize.current = { kind, index, size };
    setDrag({ kind, index, size });
  };

  const cols = Array.from({ length: sheet.cols }, (_, i) => i);
  const totalW = HEAD_W + cols.reduce((sum, c) => sum + colW(c), 0);

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
          onMouseDown={onBodyMouseDown}
          onMouseOver={onBodyMouseOver}
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
                onMouseDown={(e) => {
                  e.preventDefault();
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
                    onMouseDown={(e) => {
                      if (e.button !== 0) return;
                      e.preventDefault();
                      focusGrid();
                      if (editing) props.onCommitEdit('none');
                      origin.current = { r: 0, c };
                      mode.current = 'col';
                      if (e.shiftKey) props.onSelect({ r1: 0, c1: active.c, r2: sheet.rows - 1, c2: c });
                      else props.onSelect({ r1: 0, c1: c, r2: sheet.rows - 1, c2: c }, { r: 0, c });
                    }}
                    onMouseOver={() => {
                      if (mode.current === 'col') extendTo(0, c);
                    }}
                    className={`sticky top-0 z-20 border-r border-b border-[var(--sheet-line)] p-0 text-[11px] font-semibold ${
                      on
                        ? 'bg-[var(--sheet-head-on)] text-foreground'
                        : 'bg-[var(--sheet-head)] text-muted-foreground'
                    }`}
                  >
                    <div className="relative flex h-full cursor-pointer items-center justify-center">
                      {colName(c)}
                      <span
                        onMouseDown={(e) => startResize(e, 'col', c)}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          props.onResizeCol(c, DEFAULT_COL_W);
                        }}
                        title="Drag to resize · double-click to reset"
                        className="absolute top-0 -right-[3px] z-10 h-full w-[6px] cursor-col-resize hover:bg-[var(--sheet-accent)]"
                      />
                    </div>
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
                    onMouseDown={(e) => {
                      if (e.button !== 0) return;
                      e.preventDefault();
                      focusGrid();
                      if (editing) props.onCommitEdit('none');
                      origin.current = { r, c: 0 };
                      mode.current = 'row';
                      if (e.shiftKey) props.onSelect({ r1: active.r, c1: 0, r2: r, c2: sheet.cols - 1 });
                      else props.onSelect({ r1: r, c1: 0, r2: r, c2: sheet.cols - 1 }, { r, c: 0 });
                    }}
                    onMouseOver={() => {
                      if (mode.current === 'row') extendTo(r, 0);
                    }}
                    className={`sticky left-0 z-10 border-r border-b border-[var(--sheet-line)] p-0 text-[11px] font-semibold ${
                      on
                        ? 'bg-[var(--sheet-head-on)] text-foreground'
                        : 'bg-[var(--sheet-head)] text-muted-foreground'
                    }`}
                  >
                    <div className="relative flex h-full cursor-pointer items-center justify-center">
                      {r + 1}
                      <span
                        onMouseDown={(e) => startResize(e, 'row', r)}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          props.onResizeRow(r, DEFAULT_ROW_H);
                        }}
                        title="Drag to resize · double-click to reset"
                        className="absolute -bottom-[3px] left-0 z-10 h-[6px] w-full cursor-row-resize hover:bg-[var(--sheet-accent)]"
                      />
                    </div>
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
              <div
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  mode.current = 'fill';
                }}
                onTouchStart={(e) => {
                  e.stopPropagation();
                  // On touch the handle extends the selection rather than filling —
                  // that is what makes formatting a range possible without a keyboard.
                  origin.current = { r: n.r1, c: n.c1 };
                  mode.current = 'cell';
                }}
                title={touch ? 'Drag to select more cells' : 'Drag to fill'}
                className={`absolute z-[7] cursor-crosshair border-2 border-white bg-[var(--sheet-accent)] dark:border-black ${
                  touch ? 'h-[18px] w-[18px] rounded-full' : 'h-[8px] w-[8px] rounded-[1px]'
                }`}
                style={{
                  left: rects.sel.x + rects.sel.w - (touch ? 9 : 4),
                  top: rects.sel.y + rects.sel.h - (touch ? 9 : 4),
                }}
              />
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
          className="absolute z-[8] h-px w-px resize-none border-0 bg-transparent p-0 opacity-0 outline-none"
          style={{ left: rects?.active.x ?? 0, top: rects?.active.y ?? 0 }}
        />

        {editing && rects && (
          <textarea
            ref={editorRef}
            value={editing.value}
            onChange={(e) => props.onEditValue(e.target.value)}
            onMouseDown={(e) => e.stopPropagation()}
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
            }}
            className="absolute z-40 resize-none overflow-hidden border-2 border-[var(--sheet-accent)] bg-card px-[4px] py-[3px] text-[12px] leading-tight shadow-md outline-none"
            rows={1}
          />
        )}
      </div>
    </div>
  );
}
