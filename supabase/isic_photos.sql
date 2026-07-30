-- ===========================================================================
-- Carné ISIC · parte 2: foto obligatoria y archivo permanente
--
-- Tres decisiones del usuario (2026-07-30):
--
--  1. La FOTO es requisito para solicitar, y se valida contra lo que exige
--     ISIC (color, mínimo 500×500 px, menos de 5 MB) antes de aceptarla.
--
--  2. Un estudiante con carné vigente NO puede volver a solicitarlo. La
--     revalidación será otro documento con su propio pago, y solo aparecerá
--     cerca del vencimiento del carné actual.
--
--  3. CCDB borra los datos del titular 6 meses después de que caduca el carné.
--     Nuestra base es el archivo permanente: guardamos el snapshot de lo que
--     se envió y la foto en nuestro Storage, no solo el número.
--
-- Ejecutar en Supabase DESPUÉS de isic_cards.sql.
-- ===========================================================================

-- ── Archivo permanente del titular ─────────────────────────────────────────
-- Snapshot de lo enviado a CCDB. No es duplicar por duplicar: cuando ISIC
-- destruya su copia, esta será la única prueba de a quién se emitió cada
-- licencia y con qué datos.
alter table isic_cards add column if not exists first_name    text;
alter table isic_cards add column if not exists last_name     text;
alter table isic_cards add column if not exists date_of_birth date;
alter table isic_cards add column if not exists email         text;
alter table isic_cards add column if not exists photo_path    text;   -- bucket isic-photos
alter table isic_cards add column if not exists photo_http_code int;  -- del PUT /photo
alter table isic_cards add column if not exists revalidated_at timestamptz;

-- ── Foto en Storage ────────────────────────────────────────────────────────
-- Bucket PRIVADO: es la foto de la cara de un estudiante. Se lee con URL
-- firmada temporal, nunca con URL pública (misma regla que `contracts` tras la
-- auditoría del 29-07).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('isic-photos', 'isic-photos', false, 5242880, array['image/jpeg', 'image/png'])
on conflict (id) do update set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png'];

-- ── Requisito de foto en el tipo de documento ──────────────────────────────
-- Se suma a los requisitos que ya tenía (estar matriculado). El requisito
-- `photo` no bloquea el preview: informa qué se va a pedir, y la creación de la
-- solicitud sí exige la foto ya subida y validada.
update document_types
   set requirements = (
         select jsonb_agg(distinct r)
           from jsonb_array_elements(
                  coalesce(requirements, '[]'::jsonb)
                  || '[{"kind":"photo","description":"Foto tipo pasaporte, en color, mínimo 500×500 px"}]'::jsonb
                ) r
       ),
       updated_at = now()
 where isic_card = true
   and not (coalesce(requirements, '[]'::jsonb) @> '[{"kind":"photo"}]'::jsonb);
