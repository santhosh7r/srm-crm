'use client';

import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/** Base hues, mirroring the Office theme row. */
const THEME = [
  '#FFFFFF', '#000000', '#E7E6E6', '#44546A', '#4472C4',
  '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5', '#70AD47',
];

const STANDARD = [
  '#C00000', '#FF0000', '#FFC000', '#FFFF00', '#92D050',
  '#00B050', '#00B0F0', '#0070C0', '#002060', '#7030A0',
];

/** Tint (amount > 0) or shade (amount < 0) a hex colour, the way Excel builds its palette column. */
function shift(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
    amount >= 0 ? Math.round(v + (255 - v) * amount) : Math.round(v * (1 + amount)),
  );
  return `#${ch.map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

// White and black shift the opposite way from the coloured columns, same as Excel.
const TINTS = [0.8, 0.6, 0.4, -0.25, -0.5];
const columnFor = (base: string) =>
  TINTS.map((t) => {
    if (base === '#FFFFFF') return shift('#FFFFFF', -Math.abs(t) * 0.65);
    if (base === '#000000') return shift('#000000', Math.abs(t) * 0.9);
    return shift(base, t);
  });

const RECENT_KEY = 'riya-sheets-recent-colors';

function readRecent(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]).slice(0, 10) : [];
  } catch {
    return [];
  }
}

interface Props {
  /** Icon shown above the colour bar (e.g. the "A" for text colour). */
  icon: React.ReactNode;
  title: string;
  /** Colour of the bar under the icon; undefined shows the "no colour" state. */
  value?: string;
  /** Label for the reset entry — "Automatic" for text, "No fill" for backgrounds. */
  resetLabel: string;
  onPick: (color: string | undefined) => void;
  disabled?: boolean;
}

export function ColorPicker({ icon, title, value, resetLabel, onPick, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);

  const choose = (color: string | undefined) => {
    if (color) {
      const next = [color, ...readRecent().filter((c) => c !== color)].slice(0, 10);
      try {
        window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        /* private mode — recents are a convenience, not required */
      }
      setRecent(next);
    }
    onPick(color);
    setOpen(false);
  };

  const swatch = (color: string, key: string) => (
    <button
      key={key}
      type="button"
      title={color}
      onClick={() => choose(color)}
      style={{ background: color }}
      className={`h-[22px] w-[22px] rounded-[3px] border transition-transform hover:z-10 hover:scale-115 sm:h-[18px] sm:w-[18px] ${
        value?.toUpperCase() === color.toUpperCase()
          ? 'border-foreground ring-1 ring-foreground'
          : 'border-black/20 dark:border-white/25'
      }`}
    />
  );

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setRecent(readRecent());
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          title={title}
          disabled={disabled}
          className="flex h-9 w-9 flex-col items-center justify-center gap-[2px] rounded-md text-foreground transition-colors hover:bg-muted disabled:opacity-40 sm:h-8 sm:w-8"
        >
          <span className="flex h-[13px] items-center text-[12px] leading-none font-semibold">{icon}</span>
          <span
            className="h-[4px] w-[16px] rounded-[1px] border border-black/10 dark:border-white/20"
            style={{
              background:
                value ??
                'repeating-linear-gradient(45deg, #bbb 0 2px, #fff 2px 4px)',
            }}
          />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-auto p-2.5">
        <button
          type="button"
          onClick={() => choose(undefined)}
          className="mb-2 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium hover:bg-muted"
        >
          <span className="h-[14px] w-[14px] rounded-[3px] border border-border bg-[repeating-linear-gradient(45deg,#bbb_0_2px,#fff_2px_4px)]" />
          {resetLabel}
        </button>

        <p className="mb-1 px-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
          Theme colours
        </p>
        <div className="grid grid-cols-10 gap-[3px]">
          {THEME.map((c) => swatch(c, `t-${c}`))}
          {TINTS.map((_, row) =>
            THEME.map((base) => swatch(columnFor(base)[row], `t-${base}-${row}`)),
          )}
        </div>

        <p className="mt-2.5 mb-1 px-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
          Standard colours
        </p>
        <div className="grid grid-cols-10 gap-[3px]">{STANDARD.map((c) => swatch(c, `s-${c}`))}</div>

        {recent.length > 0 && (
          <>
            <p className="mt-2.5 mb-1 px-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
              Recent
            </p>
            <div className="grid grid-cols-10 gap-[3px]">{recent.map((c) => swatch(c, `r-${c}`))}</div>
          </>
        )}

        <label className="mt-2.5 flex cursor-pointer items-center gap-2 rounded-md border border-border px-2 py-1.5 text-xs font-medium hover:bg-muted">
          <input
            type="color"
            className="h-5 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
            value={value ?? '#000000'}
            onChange={(e) => onPick(e.target.value.toUpperCase())}
          />
          Custom colour…
        </label>
      </PopoverContent>
    </Popover>
  );
}
