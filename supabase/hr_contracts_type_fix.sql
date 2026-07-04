-- ============================================================================
-- Fix: la restricción CHECK de hr_contracts.contract_type no coincide con los
-- valores que usa el formulario (contractor / external / employee).
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================================

alter table hr_contracts drop constraint if exists hr_contracts_contract_type_check;

alter table hr_contracts add constraint hr_contracts_contract_type_check
  check (contract_type in (
    'contractor', 'external', 'employee',      -- valores de la app
    'indefinite', 'fixed_term', 'services', 'internship'  -- legado (por si hay filas antiguas)
  ));
