-- ===========================================================================
-- El supervisor y las mejoras continuas, por CAMPAÑA
--
-- Camila atiende varias campañas por el mismo número y cada una se mide con su
-- propio éxito (volver al aula / pagar / solicitar el título / simular cashpay
-- / retomar). Sin distinguir campaña:
--   - los hallazgos se mezclan (un fallo de cobranza parece uno de retención);
--   - y peor: una mejora nacida en cobranza se aplicaba al prompt COMPLETO, es
--     decir también a titulación, donde puede ser incorrecta.
--
-- `campaign_key` acota cada sugerencia. 'todas' = mejora transversal.
-- Ejecutar en Supabase.
-- ===========================================================================

alter table supervisor_suggestions add column if not exists campaign_key text not null default 'todas';
create index if not exists ss_campaign_idx on supervisor_suggestions (campaign_key);

-- Con "Automatically expose new tables" apagado, toda tabla/columna nueva debe
-- conceder acceso explícito al rol que usa el ERP.
grant all on table supervisor_suggestions to service_role;
