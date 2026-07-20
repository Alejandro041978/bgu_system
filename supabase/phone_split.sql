-- Separación del teléfono: código de país + número nacional.
-- phone_number se mantiene como el canónico E.164 (+51958047145) para envíos.
alter table academic_students
  add column if not exists phone_code text;
alter table academic_students
  add column if not exists phone_local text;

alter table academic_students
  drop constraint if exists academic_students_phone_code_fmt;
alter table academic_students
  add constraint academic_students_phone_code_fmt
  check (phone_code is null or phone_code ~ '^\+\d{1,3}$');
