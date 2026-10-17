-- Reversión de 014_raffles.sql. BORRA las rifas y su historial de ganadores: úsala solo antes del congreso o en pruebas.
DROP TABLE IF EXISTS "RaffleWinner";
DROP TABLE IF EXISTS "Raffle";
