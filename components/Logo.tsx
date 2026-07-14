import Image from 'next/image';

/**
 * Brand mark (crown + R) and full lockup (mark + FINANCE wordmark).
 * Both are transparent PNGs cut from public/riya-finance-logo.png, so the gold
 * reads on the white (light) and black (dark) surfaces without a backing tile.
 */

export function LogoMark({
  size = 32,
  className = '',
  priority = false,
}: {
  size?: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/riya-logo-mark.png"
      alt="RIYA FINANCE"
      width={size}
      height={size}
      priority={priority}
      className={`object-contain ${className}`}
      style={{ width: size, height: 'auto' }}
    />
  );
}

export function LogoLockup({
  width = 120,
  className = '',
  priority = false,
}: {
  width?: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/riya-logo-full.png"
      alt="RIYA FINANCE LTD"
      width={width}
      height={Math.round((width * 868) / 559)}
      priority={priority}
      className={`object-contain ${className}`}
      style={{ width, height: 'auto' }}
    />
  );
}
