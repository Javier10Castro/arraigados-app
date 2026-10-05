import { useState } from 'react';
import ScreenHeader from '../../components/ScreenHeader';
import { menuPreviewItems, type MenuPreviewItem } from '../../data/menuPreview';
import DishCard from './DishCard';
import DishModal from './DishModal';
import styles from './MenuPreview.module.css';

/**
 * /menu-preview (3 oct 2026) -- propuesta visual AISLADA del Menú de
 * alimentos de Arraigados 2K26. Ruta experimental, sin enlace en el nav
 * (AppShell.tsx no se toca): se abre solo escribiendo la URL.
 *
 * Deliberadamente NO implementa todavía: modelo de datos definitivo, CRUD,
 * /admin/menu, ni conexión con /comida (foodDays/foodMenu de data/app.ts
 * siguen intactos y sin relación con esto). Todo aquí usa datos mock de
 * data/menuPreview.ts, solo para aprobar composición, cuadrícula, el panel
 * glassmorphism y el modal de detalle.
 */
export default function MenuPreview() {
  const [selected, setSelected] = useState<MenuPreviewItem | null>(null);

  return (
    <div className={`page-enter ${styles.page}`}>
      <ScreenHeader title="Menú" back="/inicio" />

      <p className={styles.intro}>
        Vista previa de diseño -- los platillos, precios y fotos son de ejemplo, no son el menú definitivo del Congreso.
      </p>

      <ul className={styles.grid}>
        {menuPreviewItems.map((item) => (
          <li key={item.id}>
            <DishCard item={item} onOpen={() => setSelected(item)} />
          </li>
        ))}
      </ul>

      {selected && <DishModal item={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
