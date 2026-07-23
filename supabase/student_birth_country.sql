-- País de NACIMIENTO del estudiante (código ISO-3, igual que country).
-- El campo `country` existente pasa a leerse como país de RESIDENCIA
-- (acompaña a la ciudad). Ejecutar con "Run and enable RLS".
alter table academic_students add column if not exists birth_country text;
