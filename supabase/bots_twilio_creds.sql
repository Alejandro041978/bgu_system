-- ============================================================================
-- Credenciales de Twilio por bot (cuentas separadas: Support BGU / Sales BGU)
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================================

alter table bots add column if not exists twilio_account_sid text;
alter table bots add column if not exists twilio_auth_token  text;

-- Antonella (cuenta "Sales BGU") — reemplaza los valores por los reales de esa cuenta
update bots set
  twilio_number      = 'whatsapp:+19296006129',
  twilio_account_sid = 'AC_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',  -- Account SID de Sales BGU
  twilio_auth_token  = 'YYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY'      -- Auth Token de Sales BGU
where key = 'antonella';

-- Sofia usa las variables de entorno existentes (cuenta Support BGU), no requiere estos campos.
