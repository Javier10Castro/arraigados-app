import { useNavigate } from 'react-router-dom';
import Button from '../components/Button';
import FlyerBackground from '../components/FlyerBackground';
import styles from './Cover.module.css';

const rcs = '/rcs/svg_editables';

export default function Cover() {
  const navigate = useNavigate();

  return (
    <div className={styles.cover}>
      <FlyerBackground />

      {/* <header className={styles.top}>
        <div className={styles.dateBlock}>
          <strong>17 y 18</strong>
          <span>
            Congreso
            <br />
            Distrital 2026
          </span>
        </div>
        <img
          className={styles.rjdt}
          src={`${rcs}/RJDT_CIRCLES_LOGO.svg`}
          alt="Red Juvenil Tijuana"
          width="603"
          height="148"
          draggable={false}
        />
        <div className={styles.desktopCornerLeft}>
          Red Juvenil
          <br />
          Tijuana
        </div>
        <div className={styles.desktopCornerRight}>
          Congreso
          <br />
          2K26
        </div>
      </header> */}

      <header className={styles.top}>
        {/* Celular: "Congreso Distrital 2026" arriba a la izquierda (Antarctican
            Ultrabold) y la fecha arriba a la derecha (Pressio). */}
        <div className={styles.districtBlock}>
          Congreso
          <br />
          Distrital 2026
        </div>

        <div className={styles.dateBlock}>
          <strong>17 y 18</strong>
          <span>Octubre</span>
        </div>

        <img
          className={styles.rjdt}
          src={`${rcs}/RJDT_CIRCLES_LOGO.svg`}
          alt="Red Juvenil Tijuana"
          width="603"
          height="148"
          draggable={false}
        />

        <div className={styles.desktopCornerLeft}>
          Red Juvenil
          <br />
          Tijuana
        </div>

        <div className={styles.desktopCornerRight}>
          Congreso
          <br />
          2K26
        </div>

      </header>

      <main className={styles.artwork}>
        <img
          className={styles.congressMark}
          src={`${rcs}/CONG2026k_Morado.svg`}
          alt="Congreso 2K26"
          width="2048"
          height="2048"
          draggable={false}
        />
        <div className={styles.logoStack}>
          <img
            className={styles.wordmark}
            src={`${rcs}/LogoMorado.svg`}
            alt="Arraigados"
            width="2048"
            height="2048"
            draggable={false}
          />
          <img
            className={styles.quote}
            src={`${rcs}/Cita_Beige.svg`}
            alt="Por tanto, de la manera que habéis recibido al Señor Jesucristo, andad en él; arraigados y sobreedificados en él, y confirmados en la fe, así como habéis sido enseñados, abundando en acciones de gracias. Colosenses 2:6-7"
            width="1438"
            height="269"
            draggable={false}
          />
          <div className={styles.desktopMeta} aria-label="Fecha y sedes del congreso">
            <span className={styles.desktopMetaDate}>
              17 y 18
              <br />
              Octubre
            </span>
            {/* <span className={styles.desktopMetaRight}>
              12va - 21ra
              <br />
              Iglesia
            </span> */}
          </div>
          <p className={styles.desktopVerse}>Colosenses 2:6 - 7</p>
        </div>
      </main>

      <div className={styles.bottomZone}>
        <div className={styles.actions}>
          <Button block onClick={() => navigate('/conocer')}>
            Conocer más
          </Button>
          <Button block variant="outlineLight" onClick={() => navigate('/registro')}>
            Mi registro
          </Button>
        </div>

        <footer className={styles.bottom}>
          <img
            src={`${rcs}/Sedes.svg`}
            alt="12va Iglesia y 21ra Iglesia"
            width="834"
            height="334"
            draggable={false}
          />
          <img
            src={`${rcs}/Hashtag_RJDT.svg`}
            alt="#AC2K26 Red Juvenil Tijuana"
            width="513"
            height="455"
            draggable={false}
          />
        </footer>
      </div>
    </div>
  );
}
