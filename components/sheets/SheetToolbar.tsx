'use client';

import { useRef } from 'react';
import {
  AlignCenter, AlignLeft, AlignRight, Baseline, Bold, ClipboardPaste, Copy,
  Download, Eraser, IndianRupee, Italic, Maximize2, Minimize2, PaintBucket,
  Minus, Percent, Plus, Redo2, Scissors, Strikethrough, Trash2, Underline, Undo2,
  UnfoldHorizontal, Upload, WrapText,
} from 'lucide-react';
import type { CellStyle, NumFmt } from '@/lib/sheets/engine';
import { ColorPicker } from './ColorPicker';

const FONT_SIZES = [9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36];

const FORMATS: { value: NumFmt; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'number', label: 'Number' },
  { value: 'currency', label: 'Currency' },
  { value: 'percent', label: 'Percent' },
  { value: 'comma', label: 'Comma' },
];

function Sep() {
  return <div className="mx-0.5 h-6 w-px shrink-0 bg-border" />;
}

function TBtn({
  active, title, onClick, children, disabled,
}: {
  active?: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors disabled:opacity-40 disabled:hover:bg-transparent sm:h-8 sm:w-8 ${
        active ? 'bg-secondary/25 text-foreground ring-1 ring-secondary/50' : 'text-foreground hover:bg-muted'
      }`}
    >
      {children}
    </button>
  );
}

export interface ToolbarProps {
  style: CellStyle;
  onStyle: (patch: Partial<CellStyle>) => void;
  onClearFormat: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onFitCol: () => void;
  /** Width of the first selected column, in pixels. */
  colWidth: number;
  onColWidth: (w: number) => void;
  onInsertRow: () => void;
  onDeleteRow: () => void;
  onInsertCol: () => void;
  onDeleteCol: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
}

export function SheetToolbar(p: ToolbarProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const s = p.style;

  return (
    <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto overscroll-x-contain border-b border-border bg-card px-2 py-1.5 [scrollbar-width:thin]">
      <TBtn title="Undo (Ctrl+Z)" onClick={p.onUndo} disabled={!p.canUndo}>
        <Undo2 className="h-4 w-4" />
      </TBtn>
      <TBtn title="Redo (Ctrl+Y)" onClick={p.onRedo} disabled={!p.canRedo}>
        <Redo2 className="h-4 w-4" />
      </TBtn>

      <Sep />

      <TBtn title="Cut (Ctrl+X)" onClick={p.onCut}>
        <Scissors className="h-4 w-4" />
      </TBtn>
      <TBtn title="Copy (Ctrl+C)" onClick={p.onCopy}>
        <Copy className="h-4 w-4" />
      </TBtn>
      <TBtn title="Paste (Ctrl+V)" onClick={p.onPaste}>
        <ClipboardPaste className="h-4 w-4" />
      </TBtn>

      <Sep />

      <select
        title="Font size"
        aria-label="Font size"
        value={s.size ?? 12}
        onChange={(e) => p.onStyle({ size: Number(e.target.value) })}
        className="h-9 shrink-0 rounded-md border border-border bg-background px-1.5 text-[16px] font-medium outline-none focus:ring-2 focus:ring-ring/40 sm:h-8 sm:text-xs"
      >
        {FONT_SIZES.map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>

      <Sep />

      <TBtn title="Bold (Ctrl+B)" active={s.bold} onClick={() => p.onStyle({ bold: !s.bold })}>
        <Bold className="h-4 w-4" />
      </TBtn>
      <TBtn title="Italic (Ctrl+I)" active={s.italic} onClick={() => p.onStyle({ italic: !s.italic })}>
        <Italic className="h-4 w-4" />
      </TBtn>
      <TBtn title="Underline (Ctrl+U)" active={s.underline} onClick={() => p.onStyle({ underline: !s.underline })}>
        <Underline className="h-4 w-4" />
      </TBtn>
      <TBtn title="Strikethrough" active={s.strike} onClick={() => p.onStyle({ strike: !s.strike })}>
        <Strikethrough className="h-4 w-4" />
      </TBtn>

      <Sep />

      <ColorPicker
        icon={<Baseline className="h-[13px] w-[13px]" />}
        title="Text colour"
        value={s.color}
        resetLabel="Automatic"
        onPick={(color) => p.onStyle({ color })}
      />
      <ColorPicker
        icon={<PaintBucket className="h-[13px] w-[13px]" />}
        title="Fill colour"
        value={s.bg}
        resetLabel="No fill"
        onPick={(bg) => p.onStyle({ bg })}
      />

      <Sep />

      <TBtn title="Align left" active={(s.align ?? 'left') === 'left'} onClick={() => p.onStyle({ align: 'left' })}>
        <AlignLeft className="h-4 w-4" />
      </TBtn>
      <TBtn title="Align centre" active={s.align === 'center'} onClick={() => p.onStyle({ align: 'center' })}>
        <AlignCenter className="h-4 w-4" />
      </TBtn>
      <TBtn title="Align right" active={s.align === 'right'} onClick={() => p.onStyle({ align: 'right' })}>
        <AlignRight className="h-4 w-4" />
      </TBtn>
      <TBtn title="Wrap text" active={s.wrap} onClick={() => p.onStyle({ wrap: !s.wrap })}>
        <WrapText className="h-4 w-4" />
      </TBtn>

      <Sep />

      <TBtn title="Currency format" active={s.fmt === 'currency'} onClick={() => p.onStyle({ fmt: s.fmt === 'currency' ? 'general' : 'currency' })}>
        <IndianRupee className="h-4 w-4" />
      </TBtn>
      <TBtn title="Percent format" active={s.fmt === 'percent'} onClick={() => p.onStyle({ fmt: s.fmt === 'percent' ? 'general' : 'percent' })}>
        <Percent className="h-4 w-4" />
      </TBtn>
      <select
        title="Number format"
        aria-label="Number format"
        value={s.fmt ?? 'general'}
        onChange={(e) => p.onStyle({ fmt: e.target.value as NumFmt })}
        className="h-9 shrink-0 rounded-md border border-border bg-background px-1.5 text-[16px] font-medium outline-none focus:ring-2 focus:ring-ring/40 sm:h-8 sm:text-xs"
      >
        {FORMATS.map((f) => (
          <option key={f.value} value={f.value}>{f.label}</option>
        ))}
      </select>

      <Sep />

      <TBtn title="Insert row above" onClick={p.onInsertRow}>
        <span className="flex items-center"><Plus className="h-3 w-3" /><span className="text-[10px] font-bold">R</span></span>
      </TBtn>
      <TBtn title="Insert column left" onClick={p.onInsertCol}>
        <span className="flex items-center"><Plus className="h-3 w-3" /><span className="text-[10px] font-bold">C</span></span>
      </TBtn>
      <TBtn title="Delete row" onClick={p.onDeleteRow}>
        <span className="flex items-center"><Trash2 className="h-3 w-3" /><span className="text-[10px] font-bold">R</span></span>
      </TBtn>
      <TBtn title="Delete column" onClick={p.onDeleteCol}>
        <span className="flex items-center"><Trash2 className="h-3 w-3" /><span className="text-[10px] font-bold">C</span></span>
      </TBtn>
      {/* Column width — the same job as dragging the divider, but reachable on a phone. */}
      <div className="flex shrink-0 items-center gap-0.5">
        <TBtn title="Narrower column" onClick={() => p.onColWidth(Math.max(28, p.colWidth - 20))}>
          <Minus className="h-4 w-4" />
        </TBtn>
        <input
          type="number"
          min={28}
          max={640}
          value={p.colWidth}
          title="Column width in pixels"
          aria-label="Column width in pixels"
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) p.onColWidth(Math.max(28, Math.min(640, Math.round(n))));
          }}
          className="h-9 w-14 shrink-0 rounded-md border border-border bg-background px-1 text-center text-[16px] font-medium outline-none focus:ring-2 focus:ring-ring/40 sm:h-8 sm:w-12 sm:text-xs"
        />
        <TBtn title="Wider column" onClick={() => p.onColWidth(Math.min(640, p.colWidth + 20))}>
          <Plus className="h-4 w-4" />
        </TBtn>
        <TBtn title="Fit column width to contents" onClick={p.onFitCol}>
          <UnfoldHorizontal className="h-4 w-4" />
        </TBtn>
      </div>
      <TBtn title="Clear formatting" onClick={p.onClearFormat}>
        <Eraser className="h-4 w-4" />
      </TBtn>

      <Sep />

      <TBtn title="Import .xlsx / .csv" onClick={() => fileRef.current?.click()}>
        <Upload className="h-4 w-4" />
      </TBtn>
      <TBtn title="Export to Excel (.xlsx)" onClick={p.onExport}>
        <Download className="h-4 w-4" />
      </TBtn>
      <TBtn title={p.fullscreen ? 'Exit full screen' : 'Full screen'} onClick={p.onToggleFullscreen}>
        {p.fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      </TBtn>

      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) p.onImport(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
