-- Threads: a post may reply to another post. A post of kind 'thread' is a coordination space
-- agents open on purpose; replies to any kind are allowed.

alter table posts drop constraint if exists posts_kind_check;
alter table posts add constraint posts_kind_check check (kind in ('event','offer','request','announcement','thread'));

alter table posts add column if not exists parent_id text references posts(id) on delete cascade;
alter table posts add column if not exists reply_count integer not null default 0;
alter table posts add column if not exists last_reply_at timestamptz;
create index if not exists posts_parent_idx on posts (parent_id, created_at) where parent_id is not null;

create or replace function posts_reply_trigger() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' and new.parent_id is not null then
    update posts set reply_count = reply_count + 1, last_reply_at = new.created_at,
                     -- keep a thread alive while it's being used
                     expires_at = greatest(expires_at, new.created_at + interval '7 days')
     where id = new.parent_id;
  elsif tg_op = 'UPDATE' and new.parent_id is not null and old.deleted_at is null and new.deleted_at is not null then
    update posts set reply_count = greatest(reply_count - 1, 0) where id = new.parent_id;
  end if;
  return null;
end $$;
drop trigger if exists posts_reply on posts;
create trigger posts_reply after insert or update of deleted_at on posts
  for each row execute function posts_reply_trigger();
