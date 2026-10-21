import Image from 'next/image';

/**
 * Logo 2.0: the "Riya" wordmark, and the full lockup (wordmark + FINANCE).
 * Both are transparent PNGs cut from public/logo2.0.png, so the gold reads on
 * the light and dark surfaces without a backing tile.
 */

const MARK = { src: '/riya-logo2-mark.png', w: 759, h: 360 };
const FULL = { src: '/riya-logo2-full.png', w: 900, h: 527 };

/** The wordmark is wide, so `size` sets its height; the width follows. */
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
      src={MARK.src}
      alt="RIYA FINANCE"
      width={Math.round((size * MARK.w) / MARK.h)}
      height={size}
      priority={priority}
      className={`object-contain ${className}`}
      style={{ height: size, width: 'auto' }}
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
      src={FULL.src}
      alt="RIYA FINANCE LTD"
      width={width}
      height={Math.round((width * FULL.h) / FULL.w)}
      priority={priority}
      className={`object-contain ${className}`}
      style={{ width, height: 'auto' }}
    />
  );
}
