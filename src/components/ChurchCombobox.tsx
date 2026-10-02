import { useId, useMemo, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { CITY_ORDER, naturalChurchCompare, type Church } from '../../shared/churches';
import styles from './ChurchCombobox.module.css';

/**
 * Buscador estricto de iglesias:
 * - El valor (id) siempre es una iglesia real de Neon; si sales del campo sin
 *   elegir, el texto se borra. Para "quitar" la iglesia, se borra el texto.
 * - Agrupado por ciudad (Tijuana → Rosarito → Tecate) y en orden numérico real.
 * - Busca por nombre o por ciudad ("Tecate" también encuentra "Cerro Azul").
 * - Teclado: flechas, Enter y Escape.
 */
export default function ChurchCombobox({
  id,
  churches,
  selectedId,
  invalid = false,
  onSelect,
  placeholder = 'Escribe tu iglesia o ciudad...',
}: {
  id: string;
  churches: Church[];
  selectedId: string;
  invalid?: boolean;
  onSelect: (id: string) => void;
  placeholder?: string;
}) {
  const listId = useId();
  const churchesById = useMemo(() => new Map(churches.map((c) => [c.id, c])), [churches]);
  const [query, setQuery] = useState(() => churchesById.get(selectedId)?.name ?? '');
  const [isOpen, setIsOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered: Church[] =
      q === '' || churchesById.get(selectedId)?.name === query
        ? churches
        : churches.filter((c) => c.name.toLowerCase().includes(q) || c.city.toLowerCase().includes(q));
    const byCity = new Map<Church['city'], Church[]>();
    for (const c of filtered) {
      if (!byCity.has(c.city)) byCity.set(c.city, []);
      byCity.get(c.city)!.push(c);
    }
    for (const list of byCity.values()) list.sort((a, b) => naturalChurchCompare(a.name, b.name));
    return CITY_ORDER.filter((city) => byCity.has(city)).map((city) => ({ city, churches: byCity.get(city)! }));
  }, [query, selectedId, churches, churchesById]);

  const flat = useMemo(() => groups.flatMap((g) => g.churches), [groups]);
  const optionId = (i: number) => `${listId}-opt-${i}`;

  const choose = (church: Church) => {
    onSelect(church.id);
    setQuery(church.name);
    setIsOpen(false);
  };

  const move = (delta: number) => {
    if (!isOpen) {
      setIsOpen(true);
      return;
    }
    if (flat.length === 0) return;
    const next = (highlighted + delta + flat.length) % flat.length;
    setHighlighted(next);
    document.getElementById(optionId(next))?.scrollIntoView({ block: 'nearest' });
  };

  let index = -1;

  return (
    <div className={styles.searchWrap}>
      <input
        id={id}
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-invalid={invalid || (query.trim().length > 0 && !selectedId)}
        aria-activedescendant={isOpen && flat[highlighted] ? optionId(highlighted) : undefined}
        className={`${styles.input} ${styles.search} ${query.trim().length > 0 && !selectedId ? styles.inputInvalid : ''}`}
        placeholder={placeholder}
        autoComplete="off"
        value={query}
        onFocus={() => setIsOpen(true)}
        onChange={(e) => {
          const value = e.target.value;
          setQuery(value);
          setIsOpen(true);
          setHighlighted(0);
          // En cuanto el texto deja de coincidir con la iglesia elegida, deja de ser válida.
          if (selectedId && churchesById.get(selectedId)?.name !== value) onSelect('');
        }}
        onBlur={() => {
          setIsOpen(false);
          if (!selectedId) setQuery('');
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            move(1);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            move(-1);
          } else if (e.key === 'Enter' && isOpen) {
            e.preventDefault();
            if (flat[highlighted]) choose(flat[highlighted]);
          } else if (e.key === 'Escape') {
            setIsOpen(false);
          }
        }}
      />
      <Search className={styles.searchIcon} size={17} strokeWidth={2.2} />
      {isOpen && (
        <ul id={listId} role="listbox" aria-label="Iglesias" className={styles.suggestions}>
          {flat.length === 0 && <li className={styles.noResult}>Sin resultados. Revisa cómo lo escribiste.</li>}
          {groups.map((group) => (
            <li key={group.city} role="presentation">
              <span className={styles.groupLabel} aria-hidden="true">
                {group.city}
              </span>
              <ul role="group" aria-label={group.city} className={styles.groupList}>
                {group.churches.map((c) => {
                  index += 1;
                  const i = index;
                  const active = i === highlighted;
                  return (
                    <li
                      key={c.id}
                      id={optionId(i)}
                      role="option"
                      aria-selected={c.id === selectedId}
                      className={`${styles.option} ${active ? styles.optionActive : ''}`}
                      // preventDefault le gana al blur del input: un clic siempre confirma.
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setHighlighted(i)}
                      onClick={() => choose(c)}
                    >
                      {c.id === selectedId && <Check size={14} strokeWidth={3} />}
                      <span>{c.name}</span>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
