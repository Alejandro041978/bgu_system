alter table hr_contracts add column if not exists signnow_document_id text;
alter table hr_contracts add column if not exists signnow_status text; -- pending, signed, not_sent
