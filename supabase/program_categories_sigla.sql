-- Sigla de la categoría de programas (máx. 5 caracteres)
alter table academic_programs_category
  add column if not exists sigla text;

alter table academic_programs_category
  drop constraint if exists academic_programs_category_sigla_len;
alter table academic_programs_category
  add constraint academic_programs_category_sigla_len
  check (sigla is null or char_length(sigla) <= 5);
