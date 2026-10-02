import styles from './FlyerBackground.module.css';

const layers = [
  ['base.svg', 'base'],
  ['upper-dark.svg', 'upperDark'],
  ['upper-light.svg', 'upperLight'],
  ['left-arch.svg', 'leftArch'],
  ['cream-wave.svg', 'creamWave'],
  ['lower-lavender.svg', 'lowerLavender'],
  ['lower-indigo.svg', 'lowerIndigo'],
  ['lower-right-window.svg', 'lowerRightWindow'],
  ['ambient-glows.svg', 'ambientGlows'],
  ['lens-flare.svg', 'lensFlare'],
  ['surface-wear.svg', 'surfaceWear'],
  ['grain.svg', 'grain'],
] as const;

export default function FlyerBackground({ className }: { className?: string }) {
  return (
    <div className={`${styles.background}${className ? ` ${className}` : ''}`} aria-hidden="true">
      <div className={styles.fallback} />
      <div className={styles.layers}>
        {layers.map(([file, layer]) => (
          <img
            key={file}
            className={`${styles.layer} ${styles[layer]}`}
            src={`/rcs/background/${file}`}
            alt=""
            draggable={false}
          />
        ))}
      </div>
      <div className={styles.vignette} />
    </div>
  );
}
