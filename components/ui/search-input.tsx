'use client';

import { Search, X } from 'lucide-react';

import { cn } from '@/lib/utils';

interface SearchInputProps extends Omit<React.ComponentProps<'input'>, 'onChange' | 'value'> {
  value: string;
  onValueChange: (value: string) => void;
  /** Classes for the wrapper — use this to control width. */
  className?: string;
  /** Classes for the input itself — use this to override height/padding. */
  inputClassName?: string;
}

function SearchInput({
  value,
  onValueChange,
  className,
  inputClassName,
  placeholder = 'Search...',
  ...props
}: SearchInputProps) {
  return (
    <div className={cn('relative w-full group', className)}>
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none transition-colors group-focus-within:text-primary" />
      <input
        type="text"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'w-full h-11 pl-10 pr-10 rounded-xl bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground shadow-sm transition-all',
          'focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/15 hover:border-border/80',
          inputClassName,
        )}
        {...props}
      />
      {value && (
        <button
          type="button"
          onClick={() => onValueChange('')}
          aria-label="Clear search"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

export { SearchInput };
