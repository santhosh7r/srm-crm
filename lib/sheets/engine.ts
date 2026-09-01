/**
 * A small spreadsheet engine: cell addressing, a formula parser/evaluator,
 * number formatting and TSV clipboard helpers.
 *
 * Nothing here touches the CRM — the Sheets page is a standalone scratchpad.
 */

/* ────────────────────────────── types ────────────────────────────── */

export type CellError = { err: string };
export type Value = number | string | boolean | CellError;
export type Arg = Value | Value[];

export type NumFmt = 'general' | 'number' | 'currency' | 'percent' | 'comma';

export interface CellStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: string;
  bg?: string;
  align?: 'left' | 'center' | 'right';
  size?: number;
  fmt?: NumFmt;
  wrap?: boolean;
}

/** `v` is the raw text the user typed — a formula keeps its leading `=`. */
export interface Cell {
  v?: string;
  s?: CellStyle;
}

export interface Sheet {
  id: string;
  name: string;
  color?: string;
  rows: number;
  cols: number;
  cells: Record<string, Cell>;
  colW: Record<number, number>;
  rowH: Record<number, number>;
}

export interface Doc {
  sheets: Sheet[];
  activeId: string;
}

export interface Range {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}

export const DEFAULT_COL_W = 104;
export const DEFAULT_ROW_H = 26;
export const HEAD_W = 48;

/* ──────────────────────────── addressing ─────────────────────────── */

/** 0 → "A", 25 → "Z", 26 → "AA" */
export function colName(index: number): string {
  let out = '';
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** "A" → 0, "AA" → 26 */
export function colIndex(name: string): number {
  let n = 0;
  for (const ch of name.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export const cellKey = (r: number, c: number) => `${colName(c)}${r + 1}`;

export function parseRef(ref: string): { r: number; c: number } | null {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d{1,7})$/.exec(ref.trim());
  if (!m) return null;
  const r = parseInt(m[2], 10) - 1;
  if (r < 0) return null;
  return { r, c: colIndex(m[1]) };
}

export const normRange = (s: Range): Range => ({
  r1: Math.min(s.r1, s.r2),
  c1: Math.min(s.c1, s.c2),
  r2: Math.max(s.r1, s.r2),
  c2: Math.max(s.c1, s.c2),
});

export function rangeLabel(s: Range): string {
  const n = normRange(s);
  const a = cellKey(n.r1, n.c1);
  const b = cellKey(n.r2, n.c2);
  return a === b ? a : `${a}:${b}`;
}

export function forEachCell(s: Range, fn: (r: number, c: number) => void) {
  const n = normRange(s);
  for (let r = n.r1; r <= n.r2; r++) for (let c = n.c1; c <= n.c2; c++) fn(r, c);
}

/* ─────────────────────────────── values ──────────────────────────── */

export const isErr = (v: unknown): v is CellError =>
  typeof v === 'object' && v !== null && 'err' in (v as Record<string, unknown>);

const THOUSANDS = /^-?\d{1,3}(,\d{3})+(\.\d+)?$/;

/** Turn raw cell text into a typed value (numbers stay numbers, `'x` stays text). */
export function parseLiteral(raw: string): Value {
  const s = raw.trim();
  if (s === '') return '';
  if (raw.startsWith("'")) return raw.slice(1);
  const up = s.toUpperCase();
  if (up === 'TRUE') return true;
  if (up === 'FALSE') return false;
  if (THOUSANDS.test(s)) return Number(s.replace(/,/g, ''));
  if (/^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return Number(s);
  if (/^-?(\d+\.?\d*|\.\d+)%$/.test(s)) return Number(s.slice(0, -1)) / 100;
  return raw;
}

function toNum(v: Value): number | CellError {
  if (isErr(v)) return v;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const s = v.trim();
  if (s === '') return 0;
  const lit = parseLiteral(s);
  if (typeof lit === 'number') return lit;
  return { err: '#VALUE!' };
}

export function toStr(v: Value): string {
  if (isErr(v)) return v.err;
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') return trimFloat(v);
  return v;
}

/** Kill binary-float noise: 0.1+0.2 should read as 0.3, not 0.30000000000000004. */
function trimFloat(n: number): string {
  if (!Number.isFinite(n)) return n > 0 ? '#NUM!' : '#NUM!';
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
  const r = Number(n.toPrecision(12));
  return String(r);
}

/* ───────────────────────────── formatting ────────────────────────── */

function withCommas(n: number, decimals: number): string {
  return n.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** What the cell shows once a number format is applied. */
export function formatValue(v: Value, fmt: NumFmt = 'general'): string {
  if (isErr(v)) return v.err;
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v !== 'number') return v;
  switch (fmt) {
    case 'number':
      return v.toFixed(2);
    case 'currency':
      return `₹${withCommas(v, 2)}`;
    case 'percent':
      return `${Number((v * 100).toPrecision(12))}%`;
    case 'comma':
      return withCommas(v, 2);
    default:
      return trimFloat(v);
  }
}

/* ───────────────────────────── tokenizer ─────────────────────────── */

type Tok =
  | { t: 'num'; v: string }
  | { t: 'str'; v: string }
  | { t: 'bool'; v: string }
  | { t: 'ref'; v: string }
  | { t: 'range'; v: string }
  | { t: 'name'; v: string }
  | { t: 'op'; v: string }
  | { t: 'lp' }
  | { t: 'rp' }
  | { t: 'comma' };

const REF = String.raw`\$?[A-Za-z]{1,3}\$?\d{1,7}`;
const RANGE_RE = new RegExp(`^(${REF}):(${REF})`);
const REF_RE = new RegExp(`^(${REF})(?![A-Za-z0-9_$])`);

class FormulaError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }
    if (ch === '"') {
      let j = i + 1;
      let out = '';
      let closed = false;
      while (j < src.length) {
        if (src[j] === '"') {
          if (src[j + 1] === '"') {
            out += '"';
            j += 2;
            continue;
          }
          closed = true;
          break;
        }
        out += src[j++];
      }
      if (!closed) throw new FormulaError('#ERROR!');
      toks.push({ t: 'str', v: out });
      i = j + 1;
      continue;
    }
    if (/\d/.test(ch) || (ch === '.' && /\d/.test(src[i + 1] ?? ''))) {
      const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i))!;
      toks.push({ t: 'num', v: m[0] });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z$_]/.test(ch)) {
      const rest = src.slice(i);
      const rng = RANGE_RE.exec(rest);
      if (rng) {
        toks.push({ t: 'range', v: rng[0] });
        i += rng[0].length;
        continue;
      }
      const ref = REF_RE.exec(rest);
      if (ref) {
        toks.push({ t: 'ref', v: ref[0] });
        i += ref[0].length;
        continue;
      }
      const id = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(rest);
      if (!id) throw new FormulaError('#NAME?');
      const up = id[0].toUpperCase();
      toks.push(up === 'TRUE' || up === 'FALSE' ? { t: 'bool', v: up } : { t: 'name', v: up });
      i += id[0].length;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (two === '<=' || two === '>=' || two === '<>') {
      toks.push({ t: 'op', v: two });
      i += 2;
      continue;
    }
    if ('+-*/^&=<>%'.includes(ch)) {
      toks.push({ t: 'op', v: ch });
      i++;
      continue;
    }
    if (ch === '(') { toks.push({ t: 'lp' }); i++; continue; }
    if (ch === ')') { toks.push({ t: 'rp' }); i++; continue; }
    if (ch === ',' || ch === ';') { toks.push({ t: 'comma' }); i++; continue; }
    throw new FormulaError('#ERROR!');
  }
  return toks;
}

/* ─────────────────────────────── parser ──────────────────────────── */

type Node =
  | { k: 'num'; v: number }
  | { k: 'str'; v: string }
  | { k: 'bool'; v: boolean }
  | { k: 'ref'; v: string }
  | { k: 'range'; a: string; b: string }
  | { k: 'bin'; op: string; l: Node; r: Node }
  | { k: 'neg'; x: Node }
  | { k: 'pct'; x: Node }
  | { k: 'fn'; name: string; args: Node[] };

function parse(toks: Tok[]): Node {
  let p = 0;
  const peek = () => toks[p];
  const isOp = (...ops: string[]) => {
    const t = peek();
    return t && t.t === 'op' && ops.includes(t.v);
  };

  function expr(): Node {
    let l = concat();
    while (isOp('=', '<>', '<', '>', '<=', '>=')) {
      const op = (toks[p++] as { v: string }).v;
      l = { k: 'bin', op, l, r: concat() };
    }
    return l;
  }
  function concat(): Node {
    let l = add();
    while (isOp('&')) {
      p++;
      l = { k: 'bin', op: '&', l, r: add() };
    }
    return l;
  }
  function add(): Node {
    let l = mul();
    while (isOp('+', '-')) {
      const op = (toks[p++] as { v: string }).v;
      l = { k: 'bin', op, l, r: mul() };
    }
    return l;
  }
  function mul(): Node {
    let l = unary();
    while (isOp('*', '/')) {
      const op = (toks[p++] as { v: string }).v;
      l = { k: 'bin', op, l, r: unary() };
    }
    return l;
  }
  function unary(): Node {
    if (isOp('-')) { p++; return { k: 'neg', x: unary() }; }
    if (isOp('+')) { p++; return unary(); }
    return power();
  }
  function power(): Node {
    const l = postfix();
    if (isOp('^')) {
      p++;
      return { k: 'bin', op: '^', l, r: unary() };
    }
    return l;
  }
  function postfix(): Node {
    let x = primary();
    while (isOp('%')) { p++; x = { k: 'pct', x }; }
    return x;
  }
  function primary(): Node {
    const t = peek();
    if (!t) throw new FormulaError('#ERROR!');
    if (t.t === 'num') { p++; return { k: 'num', v: Number(t.v) }; }
    if (t.t === 'str') { p++; return { k: 'str', v: t.v }; }
    if (t.t === 'bool') { p++; return { k: 'bool', v: t.v === 'TRUE' }; }
    if (t.t === 'range') {
      p++;
      const [a, b] = t.v.split(':');
      return { k: 'range', a, b };
    }
    if (t.t === 'ref') { p++; return { k: 'ref', v: t.v }; }
    if (t.t === 'name') {
      p++;
      const next = peek();
      if (!next || next.t !== 'lp') throw new FormulaError('#NAME?');
      p++;
      const args: Node[] = [];
      if (peek() && peek().t === 'rp') { p++; return { k: 'fn', name: t.v, args }; }
      for (;;) {
        args.push(expr());
        const nt = peek();
        if (nt && nt.t === 'comma') { p++; continue; }
        if (nt && nt.t === 'rp') { p++; break; }
        throw new FormulaError('#ERROR!');
      }
      return { k: 'fn', name: t.v, args };
    }
    if (t.t === 'lp') {
      p++;
      const e = expr();
      const nt = peek();
      if (!nt || nt.t !== 'rp') throw new FormulaError('#ERROR!');
      p++;
      return e;
    }
    throw new FormulaError('#ERROR!');
  }

  const out = expr();
  if (p !== toks.length) throw new FormulaError('#ERROR!');
  return out;
}

/* ────────────────────────────── functions ────────────────────────── */

const flat = (args: Arg[]): Value[] => args.flatMap((a) => (Array.isArray(a) ? a : [a]));

function nums(args: Arg[]): number[] | CellError {
  const out: number[] = [];
  for (const a of args) {
    if (Array.isArray(a)) {
      // Ranges skip blanks and text, the way Excel's SUM does.
      for (const v of a) {
        if (isErr(v)) return v;
        if (typeof v === 'number') out.push(v);
      }
    } else {
      if (isErr(a)) return a;
      if (a === '') continue;
      const n = toNum(a);
      if (isErr(n)) return n;
      out.push(n);
    }
  }
  return out;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function first(args: Arg[]): Value {
  const a = args[0];
  if (a === undefined) return '';
  return Array.isArray(a) ? (a[0] ?? '') : a;
}

function matcher(crit: Value): (v: Value) => boolean {
  if (isErr(crit)) return () => false;
  const s = typeof crit === 'string' ? crit.trim() : toStr(crit);
  const m = /^(>=|<=|<>|>|<|=)?([\s\S]*)$/.exec(s)!;
  const op = m[1] ?? '=';
  const rest = m[2].trim();
  const asNum = rest === '' ? NaN : Number(rest);
  const numeric = rest !== '' && !Number.isNaN(asNum);
  return (v: Value) => {
    if (isErr(v)) return false;
    if (numeric) {
      const n = typeof v === 'number' ? v : Number(toStr(v));
      if (Number.isNaN(n)) return op === '<>';
      switch (op) {
        case '>': return n > asNum;
        case '<': return n < asNum;
        case '>=': return n >= asNum;
        case '<=': return n <= asNum;
        case '<>': return n !== asNum;
        default: return n === asNum;
      }
    }
    const a = toStr(v).toLowerCase();
    const b = rest.toLowerCase();
    switch (op) {
      case '<>': return a !== b;
      case '>': return a > b;
      case '<': return a < b;
      case '>=': return a >= b;
      case '<=': return a <= b;
      default: return a === b;
    }
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

const FUNCS: Record<string, (args: Arg[]) => Value> = {
  SUM: (a) => { const n = nums(a); return isErr(n) ? n : sum(n); },
  PRODUCT: (a) => { const n = nums(a); return isErr(n) ? n : n.reduce((x, y) => x * y, 1); },
  AVERAGE: (a) => {
    const n = nums(a);
    if (isErr(n)) return n;
    return n.length ? sum(n) / n.length : { err: '#DIV/0!' };
  },
  MIN: (a) => { const n = nums(a); return isErr(n) ? n : n.length ? Math.min(...n) : 0; },
  MAX: (a) => { const n = nums(a); return isErr(n) ? n : n.length ? Math.max(...n) : 0; },
  MEDIAN: (a) => {
    const n = nums(a);
    if (isErr(n)) return n;
    if (!n.length) return { err: '#NUM!' };
    const s = [...n].sort((x, y) => x - y);
    const mid = s.length >> 1;
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  },
  COUNT: (a) => { const n = nums(a); return isErr(n) ? n : n.length; },
  COUNTA: (a) => flat(a).filter((v) => v !== '' && !isErr(v)).length,
  COUNTBLANK: (a) => flat(a).filter((v) => v === '').length,
  ABS: (a) => { const n = toNum(first(a)); return isErr(n) ? n : Math.abs(n); },
  INT: (a) => { const n = toNum(first(a)); return isErr(n) ? n : Math.floor(n); },
  SQRT: (a) => {
    const n = toNum(first(a));
    if (isErr(n)) return n;
    return n < 0 ? { err: '#NUM!' } : Math.sqrt(n);
  },
  POWER: (a) => {
    const x = toNum(first(a));
    const y = toNum(a[1] === undefined ? 0 : (Array.isArray(a[1]) ? a[1][0] : a[1]));
    if (isErr(x)) return x;
    if (isErr(y)) return y;
    return x ** y;
  },
  MOD: (a) => {
    const x = toNum(first(a));
    const y = toNum(Array.isArray(a[1]) ? a[1][0] : (a[1] ?? 0));
    if (isErr(x)) return x;
    if (isErr(y)) return y;
    return y === 0 ? { err: '#DIV/0!' } : x - y * Math.floor(x / y);
  },
  ROUND: (a) => {
    const n = toNum(first(a));
    const d = toNum(a[1] === undefined ? 0 : (Array.isArray(a[1]) ? a[1][0] : a[1]));
    if (isErr(n)) return n;
    if (isErr(d)) return d;
    const f = 10 ** d;
    return Math.round((n + Number.EPSILON) * f) / f;
  },
  ROUNDUP: (a) => {
    const n = toNum(first(a));
    const d = toNum(a[1] === undefined ? 0 : (Array.isArray(a[1]) ? a[1][0] : a[1]));
    if (isErr(n)) return n;
    if (isErr(d)) return d;
    const f = 10 ** d;
    return (n < 0 ? -1 : 1) * Math.ceil(Math.abs(n) * f) / f;
  },
  ROUNDDOWN: (a) => {
    const n = toNum(first(a));
    const d = toNum(a[1] === undefined ? 0 : (Array.isArray(a[1]) ? a[1][0] : a[1]));
    if (isErr(n)) return n;
    if (isErr(d)) return d;
    const f = 10 ** d;
    return (n < 0 ? -1 : 1) * Math.floor(Math.abs(n) * f) / f;
  },
  AND: (a) => flat(a).every((v) => (isErr(v) ? false : v !== '' ? Boolean(toNum(v) !== 0) : true)),
  OR: (a) => flat(a).some((v) => (isErr(v) ? false : v !== '' && toNum(v) !== 0)),
  NOT: (a) => {
    const n = toNum(first(a));
    return isErr(n) ? n : n === 0;
  },
  CONCAT: (a) => flat(a).map(toStr).join(''),
  CONCATENATE: (a) => flat(a).map(toStr).join(''),
  LEN: (a) => toStr(first(a)).length,
  UPPER: (a) => toStr(first(a)).toUpperCase(),
  LOWER: (a) => toStr(first(a)).toLowerCase(),
  TRIM: (a) => toStr(first(a)).trim().replace(/\s+/g, ' '),
  LEFT: (a) => {
    const n = a[1] === undefined ? 1 : toNum(Array.isArray(a[1]) ? a[1][0] : a[1]);
    return isErr(n) ? n : toStr(first(a)).slice(0, Math.max(0, n));
  },
  RIGHT: (a) => {
    const n = a[1] === undefined ? 1 : toNum(Array.isArray(a[1]) ? a[1][0] : a[1]);
    if (isErr(n)) return n;
    const s = toStr(first(a));
    return n <= 0 ? '' : s.slice(Math.max(0, s.length - n));
  },
  MID: (a) => {
    const start = toNum(Array.isArray(a[1]) ? a[1][0] : (a[1] ?? 1));
    const len = toNum(Array.isArray(a[2]) ? a[2][0] : (a[2] ?? 0));
    if (isErr(start)) return start;
    if (isErr(len)) return len;
    return toStr(first(a)).slice(Math.max(0, start - 1), Math.max(0, start - 1) + Math.max(0, len));
  },
  SUMIF: (a) => {
    const rng = Array.isArray(a[0]) ? a[0] : [a[0] ?? ''];
    const test = matcher(Array.isArray(a[1]) ? (a[1][0] ?? '') : (a[1] ?? ''));
    const target = Array.isArray(a[2]) ? a[2] : rng;
    let total = 0;
    rng.forEach((v, i) => {
      if (!test(v)) return;
      const n = toNum(target[i] ?? 0);
      if (!isErr(n)) total += n;
    });
    return total;
  },
  COUNTIF: (a) => {
    const rng = Array.isArray(a[0]) ? a[0] : [a[0] ?? ''];
    const test = matcher(Array.isArray(a[1]) ? (a[1][0] ?? '') : (a[1] ?? ''));
    return rng.filter(test).length;
  },
  TODAY: () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  },
  NOW: () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  },
};

export const FUNCTION_NAMES = [...Object.keys(FUNCS), 'IF', 'IFERROR'].sort();

/* ───────────────────────────── evaluator ─────────────────────────── */

type Resolve = (key: string) => Value;

function expandRange(a: string, b: string, resolve: Resolve): Value[] | CellError {
  const p1 = parseRef(a);
  const p2 = parseRef(b);
  if (!p1 || !p2) return { err: '#REF!' };
  const r1 = Math.min(p1.r, p2.r);
  const r2 = Math.max(p1.r, p2.r);
  const c1 = Math.min(p1.c, p2.c);
  const c2 = Math.max(p1.c, p2.c);
  // Guard against a stray `A1:ZZ99999` locking up the tab.
  if ((r2 - r1 + 1) * (c2 - c1 + 1) > 200_000) return { err: '#NUM!' };
  const out: Value[] = [];
  for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) out.push(resolve(cellKey(r, c)));
  return out;
}

function evalNode(node: Node, resolve: Resolve): Arg {
  switch (node.k) {
    case 'num': return node.v;
    case 'str': return node.v;
    case 'bool': return node.v;
    case 'ref': {
      const p = parseRef(node.v);
      return p ? resolve(cellKey(p.r, p.c)) : { err: '#REF!' };
    }
    case 'range': return expandRange(node.a, node.b, resolve);
    case 'neg': {
      const n = toNum(single(evalNode(node.x, resolve)));
      return isErr(n) ? n : -n;
    }
    case 'pct': {
      const n = toNum(single(evalNode(node.x, resolve)));
      return isErr(n) ? n : n / 100;
    }
    case 'bin': return evalBin(node, resolve);
    case 'fn': return evalFn(node, resolve);
  }
}

function single(a: Arg): Value {
  if (Array.isArray(a)) return a.length === 1 ? a[0] : { err: '#VALUE!' };
  return a;
}

function evalBin(node: { op: string; l: Node; r: Node }, resolve: Resolve): Value {
  const lv = single(evalNode(node.l, resolve));
  const rv = single(evalNode(node.r, resolve));
  if (isErr(lv)) return lv;
  if (isErr(rv)) return rv;

  if (node.op === '&') return toStr(lv) + toStr(rv);

  if (['=', '<>', '<', '>', '<=', '>='].includes(node.op)) {
    const bothNum =
      (typeof lv === 'number' || typeof lv === 'boolean') &&
      (typeof rv === 'number' || typeof rv === 'boolean');
    let cmp: number;
    if (bothNum) {
      const a = Number(lv);
      const b = Number(rv);
      cmp = a === b ? 0 : a < b ? -1 : 1;
    } else {
      const a = toStr(lv).toLowerCase();
      const b = toStr(rv).toLowerCase();
      cmp = a === b ? 0 : a < b ? -1 : 1;
    }
    switch (node.op) {
      case '=': return cmp === 0;
      case '<>': return cmp !== 0;
      case '<': return cmp < 0;
      case '>': return cmp > 0;
      case '<=': return cmp <= 0;
      default: return cmp >= 0;
    }
  }

  const a = toNum(lv);
  if (isErr(a)) return a;
  const b = toNum(rv);
  if (isErr(b)) return b;
  switch (node.op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/': return b === 0 ? { err: '#DIV/0!' } : a / b;
    case '^': {
      const out = a ** b;
      return Number.isFinite(out) ? out : { err: '#NUM!' };
    }
    default: return { err: '#ERROR!' };
  }
}

function truthy(v: Value): boolean | CellError {
  if (isErr(v)) return v;
  if (typeof v === 'boolean') return v;
  if (v === '') return false;
  const n = toNum(v);
  return isErr(n) ? n : n !== 0;
}

function evalFn(node: { name: string; args: Node[] }, resolve: Resolve): Arg {
  // IF and IFERROR are lazy so the untaken branch can't poison the result.
  if (node.name === 'IF') {
    const cond = truthy(single(evalNode(node.args[0], resolve)));
    if (isErr(cond)) return cond;
    const branch = cond ? node.args[1] : node.args[2];
    if (!branch) return cond;
    return single(evalNode(branch, resolve));
  }
  if (node.name === 'IFERROR') {
    let v: Value;
    try {
      v = single(evalNode(node.args[0], resolve));
    } catch {
      v = { err: '#ERROR!' };
    }
    if (!isErr(v)) return v;
    return node.args[1] ? single(evalNode(node.args[1], resolve)) : '';
  }

  const fn = FUNCS[node.name];
  if (!fn) return { err: '#NAME?' };
  return fn(node.args.map((a) => evalNode(a, resolve)));
}

/** Evaluate a formula body (no leading `=`). */
export function evaluateFormula(body: string, resolve: Resolve): Value {
  try {
    const toks = tokenize(body);
    if (!toks.length) return '';
    return single(evalNode(parse(toks), resolve));
  } catch (e) {
    return { err: e instanceof FormulaError ? e.code : '#ERROR!' };
  }
}

/**
 * Compute every cell's value once, memoised, with cycle detection.
 * Returns a lookup that the grid and the status bar both read from.
 */
export function computeValues(cells: Record<string, Cell>): Map<string, Value> {
  const cache = new Map<string, Value>();
  const inProgress = new Set<string>();

  const resolve: Resolve = (key) => {
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    if (inProgress.has(key)) return { err: '#CIRC!' };

    const raw = cells[key]?.v ?? '';
    if (!raw.startsWith('=')) {
      const v = parseLiteral(raw);
      cache.set(key, v);
      return v;
    }

    inProgress.add(key);
    const v = evaluateFormula(raw.slice(1), resolve);
    inProgress.delete(key);
    cache.set(key, v);
    return v;
  };

  for (const key of Object.keys(cells)) resolve(key);
  return cache;
}

/** Value of a single cell, honouring formulas already in the computed map. */
export function valueAt(values: Map<string, Value>, cells: Record<string, Cell>, key: string): Value {
  if (values.has(key)) return values.get(key)!;
  return parseLiteral(cells[key]?.v ?? '');
}

/* ──────────────────────────── clipboard ──────────────────────────── */

/** Excel puts tab-separated rows on the clipboard; match that both ways. */
export function toTSV(grid: string[][]): string {
  return grid
    .map((row) =>
      row
        .map((cell) => (/[\t\n"]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell))
        .join('\t'),
    )
    .join('\n');
}

export function fromTSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"' && field === '') { quoted = true; i++; continue; }
    if (ch === '\t') { row.push(field); field = ''; i++; continue; }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.length ? rows : [['']];
}

/* ─────────────────────── reference rewriting ─────────────────────── */

type RefMapper = (
  r: number,
  c: number,
  absRow: boolean,
  absCol: boolean,
) => { r: number; c: number } | null;

/**
 * Rewrite every A1-style reference in a formula, leaving quoted strings and
 * function names alone. Used when filling a range and when inserting or
 * deleting rows/columns, so formulas keep pointing at the right cells.
 */
export function remapFormula(raw: string, map: RefMapper): string {
  if (!raw.startsWith('=')) return raw;
  const src = raw.slice(1);
  const re = /\$?[A-Za-z]{1,3}\$?\d{1,7}/y;
  let out = '';
  let i = 0;

  while (i < src.length) {
    const ch = src[i];

    if (ch === '"') {
      out += ch;
      let j = i + 1;
      while (j < src.length) {
        out += src[j];
        if (src[j] === '"') {
          if (src[j + 1] === '"') {
            out += src[j + 1];
            j += 2;
            continue;
          }
          j++;
          break;
        }
        j++;
      }
      i = j;
      continue;
    }

    re.lastIndex = i;
    const m = re.exec(src);
    const prevOk = i === 0 || !/[A-Za-z0-9_$.]/.test(src[i - 1]);
    if (m && prevOk) {
      const after = src[i + m[0].length] ?? '';
      // A trailing "(" means it was a function name like LOG10(, not a reference.
      if (!/[A-Za-z0-9_(]/.test(after)) {
        const ref = parseRef(m[0]);
        if (ref) {
          const absCol = m[0].startsWith('$');
          const absRow = /\$\d/.test(m[0]);
          const next = map(ref.r, ref.c, absRow, absCol);
          out +=
            next === null || next.r < 0 || next.c < 0
              ? '#REF!'
              : `${absCol ? '$' : ''}${colName(next.c)}${absRow ? '$' : ''}${next.r + 1}`;
          i += m[0].length;
          continue;
        }
      }
    }

    out += ch;
    i++;
  }
  return `=${out}`;
}

/** Shift relative references by (dr, dc) — what happens when a formula is filled or copied. */
export const translateFormula = (raw: string, dr: number, dc: number) =>
  remapFormula(raw, (r, c, absRow, absCol) => ({
    r: absRow ? r : r + dr,
    c: absCol ? c : c + dc,
  }));

/** Drop style keys that carry no meaning so cells stay small in storage. */
export function normalizeCell(cell: Cell | undefined): Cell | null {
  if (!cell) return null;
  const s = cell.s;
  let style: CellStyle | undefined;
  if (s) {
    const kept: CellStyle = {};
    if (s.bold) kept.bold = true;
    if (s.italic) kept.italic = true;
    if (s.underline) kept.underline = true;
    if (s.strike) kept.strike = true;
    if (s.wrap) kept.wrap = true;
    if (s.color) kept.color = s.color;
    if (s.bg) kept.bg = s.bg;
    if (s.align && s.align !== 'left') kept.align = s.align;
    if (s.size && s.size !== 12) kept.size = s.size;
    if (s.fmt && s.fmt !== 'general') kept.fmt = s.fmt;
    if (Object.keys(kept).length) style = kept;
  }
  const v = cell.v ?? '';
  if (v === '' && !style) return null;
  return style ? { v, s: style } : { v };
}
