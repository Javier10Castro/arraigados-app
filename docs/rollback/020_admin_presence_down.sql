-- Reversión de 020_admin_presence.sql. Borra «en línea» y los mensajes entre Admin (no afecta nada más).
-- Con el código actual, sin la 020 la esquina del panel simplemente no aparece (nunca error 500).
DROP TABLE IF EXISTS "AdminMessage";
DROP TABLE IF EXISTS "AdminPresence";
