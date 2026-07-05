-- ============================================================================
-- Las conversaciones de correo no tienen teléfono → customer_phone debe permitir NULL.
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================================

alter table wa_conversations alter column customer_phone drop not null;
