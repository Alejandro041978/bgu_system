-- Crear bucket para PDFs de contratos firmados
insert into storage.buckets (id, name, public)
values ('contracts', 'contracts', true)
on conflict (id) do nothing;

-- Política: lectura pública
create policy "contracts_public_read" on storage.objects
  for select using (bucket_id = 'contracts');

-- Política: escritura solo con service role (via API)
create policy "contracts_service_insert" on storage.objects
  for insert with check (bucket_id = 'contracts');
