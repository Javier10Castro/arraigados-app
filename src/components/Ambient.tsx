import FlyerBackground from './FlyerBackground';

type Props = { variant: 'cover' | 'dark' | 'light' | 'event' | 'home' };

export default function Ambient({ variant }: Props) {
  return (
    <div className={`ambient ambient--${variant}`} aria-hidden="true">
      <FlyerBackground className={variant === 'light' ? 'flyerBg--soft' : undefined} />
      <div className="ambient__shade" />
      <div className="ambient__grain" />
    </div>
  );
}
