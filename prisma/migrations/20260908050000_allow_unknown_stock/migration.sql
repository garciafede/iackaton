-- SEPA publica precios, pero no declara disponibilidad.
-- Conserva los valores true/false existentes; permite representar desconocido.
ALTER TABLE "Offer" ALTER COLUMN "stock" DROP NOT NULL;
