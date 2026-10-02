import { Blobatar } from '@blobatar/react';
import 'blobatar/motion.css';

interface BloBatarProps {
  name: string;
  size?: number;
  className?: string;
}

export default function BloBatar({ name, size = 80, className }: BloBatarProps) {
  return (
    <Blobatar
      name={name || 'Jane Doe'}
      size={size}
      traits={{ shape: 0.825 }}
      hue={225}
      animate="hover"
      background={false}
      className={className}
    />
  );
}
