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
  -- Chi ha pubblicato il post (profilo social o canale) e quando.
  author          text check (author is null or length(author) <= 200),
  published_at    timestamptz,
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
  -- Inferenze AI, separate dai dati letti (scheda di memoria): { v, summary,
  -- points, entities, keywords, categories, tags, model, generated_at, applied }.
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

-- Colonne aggiunte dopo la prima versione (per i database già creati).
alter table public.items add column if not exists author text check (author is null or length(author) <= 200);
alter table public.items add column if not exists published_at timestamptz;

-- updated_at automatico.
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
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
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "items_insert_own" on public.items;
create policy "items_insert_own" on public.items
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "items_update_own" on public.items;
create policy "items_update_own" on public.items
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "items_delete_own" on public.items;
create policy "items_delete_own" on public.items
  for delete to authenticated using (user_id = (select auth.uid()));

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
  using (bucket_id = 'files' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "files_insert_own" on storage.objects;
create policy "files_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'files' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "files_update_own" on storage.objects;
create policy "files_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "files_delete_own" on storage.objects;
create policy "files_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------------
-- Salvataggio rapido da Comandi Rapidi (POST /api/share), senza aprire l'app.
-- Ogni utente può avere un codice personale; nel database c'è solo il suo
-- hash SHA-256. Il server chiama share_save/share_update con il codice: le
-- funzioni trovano l'utente e scrivono solo nei suoi elementi.
-- ---------------------------------------------------------------------------
create table if not exists public.share_tokens (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  token_hash  text not null unique,
  created_at  timestamptz not null default now()
);

alter table public.share_tokens enable row level security;

drop policy if exists "share_tokens_select_own" on public.share_tokens;
create policy "share_tokens_select_own" on public.share_tokens
  for select to authenticated using (user_id = (select auth.uid()));

-- Crea (o sostituisce) il codice dell'utente collegato e lo restituisce una volta.
create or replace function public.create_share_token() returns text
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  tok text;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  tok := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.share_tokens (user_id, token_hash)
  values (uid, encode(sha256(convert_to(tok, 'UTF8')), 'hex'))
  on conflict (user_id) do update set token_hash = excluded.token_hash, created_at = now();
  return tok;
end $$;

create or replace function public.revoke_share_token() returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.share_tokens where user_id = auth.uid();
end $$;

create or replace function public.share_user(p_token text) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid;
begin
  if p_token is null or length(p_token) < 32 then raise exception 'invalid_token'; end if;
  select user_id into uid from public.share_tokens
  where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  if uid is null then raise exception 'invalid_token'; end if;
  return uid;
end $$;

-- Nuovo elemento per il proprietario del codice. Restituisce id e categorie
-- già usate (per suggerire all'AI quelle esistenti).
create or replace function public.share_save(p_token text, p_item jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.share_user(p_token);
  r public.items;
  new_id uuid;
  cats text[];
begin
  r := jsonb_populate_record(null::public.items, p_item);
  insert into public.items (user_id, type, url, title, note, status, status_detail, text_source)
  values (uid, coalesce(r.type, 'link'), r.url, r.title, r.note, coalesce(r.status, 'saved'), r.status_detail, r.text_source)
  returning id into new_id;
  select coalesce(array_agg(distinct c), '{}') into cats
  from public.items i cross join lateral unnest(i.categories) as c
  where i.user_id = uid;
  return jsonb_build_object('id', new_id, 'categories', to_jsonb(cats));
end $$;

-- Aggiorna un elemento del proprietario del codice con i dati letti e l'AI.
create or replace function public.share_update(p_token text, p_id uuid, p_patch jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.share_user(p_token);
  cur public.items;
  r public.items;
begin
  select * into cur from public.items where id = p_id and user_id = uid;
  if not found then raise exception 'not_found'; end if;
  r := jsonb_populate_record(cur, p_patch);
  update public.items set
    final_url = r.final_url, title = r.title, description = r.description, site_name = r.site_name,
    author = r.author, published_at = r.published_at, image_url = r.image_url, extracted_text = r.extracted_text, text_source = r.text_source, place = r.place,
    categories = r.categories, tags = r.tags, status = r.status, status_detail = r.status_detail,
    ai = r.ai, processed_at = r.processed_at
  where id = p_id and user_id = uid;
end $$;

-- Legge un elemento del proprietario del codice: prima di scrivere il
-- risultato il server riparte da qui, così le modifiche fatte nell'app
-- durante l'elaborazione restano. null se l'elemento non esiste più.
create or replace function public.share_get(p_token text, p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := public.share_user(p_token);
begin
  return (select to_jsonb(i) from public.items i where i.id = p_id and i.user_id = uid);
end $$;

revoke all on function public.create_share_token() from public, anon;
revoke all on function public.revoke_share_token() from public, anon;
revoke all on function public.share_user(text) from public, anon, authenticated;
revoke all on function public.share_save(text, jsonb) from public;
revoke all on function public.share_update(text, uuid, jsonb) from public;
revoke all on function public.share_get(text, uuid) from public;
grant execute on function public.create_share_token() to authenticated;
grant execute on function public.revoke_share_token() to authenticated;
grant execute on function public.share_save(text, jsonb) to anon, authenticated;
grant execute on function public.share_update(text, uuid, jsonb) to anon, authenticated;
grant execute on function public.share_get(text, uuid) to anon, authenticated;
