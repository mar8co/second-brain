-- Second Brain — schema Supabase (Postgres + Storage).
-- Da eseguire una volta nel SQL Editor del progetto Supabase.
-- Idempotente: si può rieseguire senza perdere dati.
--
-- Sicurezza: Row Level Security su tutto. Ogni utente vede e modifica solo le
-- proprie righe e i propri file (cartella <user_id>/ nel bucket privato).

create table if not exists public.items (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type            text not null default 'link'
                  check (type in ('link','social','video','place','note','shopping','image','file')),
  url             text check (url is null or (url ~* '^https?://' and length(url) <= 4000)),
  final_url       text,
  title           text check (title is null or length(title) <= 300),
  description     text check (description is null or length(description) <= 4000),
  note            text check (note is null or length(note) <= 20000),
  site_name       text,
  image_url       text,
  -- Testo letto dalla fonte (pagina, file) e da dove arriva: dati "verificati".
  extracted_text  text check (extracted_text is null or length(extracted_text) <= 25000),
  text_source     text,
  place           jsonb,             -- { name, lat, lng } se è un posto
  categories      text[] not null default '{}',
  tags            text[] not null default '{}',
  status          text not null default 'saved'
                  check (status in ('saved','processing','analyzed','partial','inaccessible')),
  status_detail   text,
  -- Inferenze AI, separate dai dati letti: { summary, categories, tags, model, generated_at }.
  ai              jsonb,
  file_path       text,              -- percorso nello Storage (bucket "files")
  file_name       text,
  file_mime       text,
  file_size       bigint check (file_size is null or file_size <= 15728640),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  processed_at    timestamptz
);

create index if not exists items_user_created_idx on public.items (user_id, created_at desc);

-- updated_at automatico.
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists items_touch on public.items;
create trigger items_touch before update on public.items
  for each row execute function public.touch_updated_at();

alter table public.items enable row level security;

drop policy if exists "items_select_own" on public.items;
create policy "items_select_own" on public.items
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "items_insert_own" on public.items;
create policy "items_insert_own" on public.items
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "items_update_own" on public.items;
create policy "items_update_own" on public.items
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "items_delete_own" on public.items;
create policy "items_delete_own" on public.items
  for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Storage: bucket PRIVATO "files" (15 MB, tipi ammessi), un file per elemento
-- in <user_id>/<item_id>/<nome>. Si accede solo con URL firmati a scadenza.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'files', 'files', false, 15728640,
  array['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif',
        'application/pdf','text/plain','text/markdown','text/csv','application/json']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "files_select_own" on storage.objects;
create policy "files_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "files_insert_own" on storage.objects;
create policy "files_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "files_update_own" on storage.objects;
create policy "files_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "files_delete_own" on storage.objects;
create policy "files_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
