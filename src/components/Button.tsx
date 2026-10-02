import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Button.module.css';

type BaseProps = {
  variant?: 'primary' | 'outline' | 'outlineLight' | 'soft';
  size?: 'md' | 'sm';
  block?: boolean;
  className?: string;
  children: ReactNode;
};

/** Variante `<button>` (comportamiento de siempre). */
type ButtonProps = BaseProps & ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };
/**
 * Variante `<a>`: pasar `href` convierte el botón en un enlace con el MISMO
 * estilo (p. ej. "Obtener ubicación" hacia Google Maps). Ningún uso existente
 * se ve afectado -- ninguno pasa `href`.
 */
type AnchorProps = BaseProps & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

type Props = ButtonProps | AnchorProps;

export default function Button({ variant = 'primary', size = 'md', block = false, className = '', children, ...rest }: Props) {
  const cls = [styles.btn, styles[variant], styles[size], block ? styles.block : '', className].filter(Boolean).join(' ');

  if (rest.href) {
    const { href, ...anchorRest } = rest as AnchorHTMLAttributes<HTMLAnchorElement>;
    return (
      <a href={href} className={cls} {...anchorRest}>
        {children}
      </a>
    );
  }

  const { href: _unused, ...buttonRest } = rest as ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };
  return (
    <button type="button" className={cls} {...buttonRest}>
      {children}
    </button>
  );
}
