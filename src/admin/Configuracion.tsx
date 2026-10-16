import AdminShell from './AdminShell';
import SelfRedeemPanel from './SelfRedeemPanel';

/**
 * Admin -> Configuración. Por ahora solo «Autocanje de pulseras» (interruptores por rol y, solo para la cuenta
 * propietaria, excepciones individuales). La ruta es solo de Admin y el servidor vuelve a exigirlo en cada llamada.
 */
export default function Configuracion() {
  return (
    <AdminShell title="Configuración">
      <SelfRedeemPanel />
    </AdminShell>
  );
}
