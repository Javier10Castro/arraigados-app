import { Blobatar } from '@blobatar/react';
import 'blobatar/motion.css';

interface BloBatarProps {
  name: string;
  size?: number;
  className?: string;
  /** Tono (0-360). Por defecto 225, el índigo de siempre. */
  hue?: number;
  /** Silueta (0-1, Blobatar tiene 10 franjas). Por defecto 0.825, la de siempre. */
  shape?: number;
  /** Claridad (0 = pálido … 1 = oscuro). Sin valor, la define la semilla. */
  tone?: number;
}

export default function BloBatar({ name, size = 80, className, hue = 225, shape = 0.825, tone }: BloBatarProps) {
  return (
    <Blobatar
      name={name || 'Jane Doe'}
      size={size}
      traits={{ shape }}
      hue={hue}
      {...(tone === undefined ? {} : { tone })}
      animate="hover"
      background={false}
      className={className}
    />
  );
}
