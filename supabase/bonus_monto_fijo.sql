-- ===========================================================================
-- Bonos de MONTO FIJO (además del porcentaje)
--
-- El Cashpay es un beneficio en dinero: Cobranzas aprueba "X dólares por
-- adelantar estas cuotas". Guardarlo como porcentaje de la tuition completa
-- obliga a DERIVAR el porcentaje, y un valor derivado deriva:
--
--   · Se pierde precisión. Adelantando 18 de 24 cuotas el beneficio es 398.09,
--     que sobre 2,880 es 13.8226…% → guardado como 13.82 devuelve 398.02.
--     Siete centavos que descuadran cuota y cabecera para siempre.
--   · Flota. Si mañana se corrige la beca o una convalidación, cambia la base y
--     ese mismo porcentaje pasa a valer otro dinero — cuando lo aprobado era
--     una cifra concreta sobre unas cuotas concretas.
--   · Miente en la auditoría. Cobranzas aprobó 18.43% y el registro diría
--     13.82%: nadie puede reconciliar eso seis meses después.
--
-- Con monto fijo se guarda el hecho, no su proyección.
--
-- El porcentaje sigue existiendo para los bonos donde el porcentaje ES el
-- hecho (un 20% comercial). Un bono tiene uno u otro, nunca ambos.
--
-- Ejecutar en Supabase.
-- ===========================================================================

alter table bonuses add column if not exists amount numeric;

-- `percentage` deja de ser obligatorio: un bono de monto fijo no lo usa.
alter table bonuses alter column percentage drop not null;

-- Exactamente uno de los dos. Sin esto, una fila con ambos haría que el total
-- dependiera de cuál lea primero cada pantalla.
alter table bonuses drop constraint if exists bonuses_pct_o_monto;
alter table bonuses add constraint bonuses_pct_o_monto check (
  (percentage is not null and amount is null)
  or (percentage is null and amount is not null)
);
