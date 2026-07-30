-- ===========================================================================
-- Carné ISIC · parte 3: ¿el estudiante lo activó?
--
-- Emitir el carné en la CCDB no es el final del trámite. El carné es DIGITAL:
-- vive en la app de ISIC, y la cuenta del estudiante nace cuando abre el enlace
-- de activación con la app ya instalada. Hasta entonces el carné existe en la
-- base de ISIC pero el estudiante no lo tiene en la mano.
--
-- `GET /cards/{n}/profile` devuelve `profileStatus` y `profileCreatedOn`, así
-- que se puede saber. Guardarlo convierte la página de licencias en algo que
-- responde la pregunta que importa: a quién hay que recordarle que lo active.
--
-- Ejecutar en Supabase DESPUÉS de isic_photos.sql.
-- ===========================================================================

alter table isic_cards add column if not exists profile_status     text;
alter table isic_cards add column if not exists profile_created_at timestamptz;
-- Cuándo se le avisó por correo (ISIC no manda ninguno: el aviso es nuestro).
alter table isic_cards add column if not exists notified_at        timestamptz;
