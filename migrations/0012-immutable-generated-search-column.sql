-- BEFORE UPDATE sees a stored generated column before PostgreSQL recomputes it.
-- tsv is derived solely from the separately protected title/body/tags columns;
-- excluding it permits counters while preserving source text/provenance.
create or replace function gongzhi_immutable_post() returns trigger language plpgsql as $$
begin
  if old.metadata->'gongzhi'->>'subtype' in ('experience','result','help','decision','need_revision') then
    if tg_op='DELETE' then raise exception 'immutable gongzhi history'; end if;
    if (to_jsonb(new)-array['retrievals','views','reply_count','last_reply_at','updated_at','tsv']) is distinct from
       (to_jsonb(old)-array['retrievals','views','reply_count','last_reply_at','updated_at','tsv']) then
      raise exception 'immutable gongzhi history';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;

create or replace function gongzhi_discussion_immutable() returns trigger language plpgsql as $$
begin
  if old.metadata->'gongzhi'->>'subtype' in ('reply','supplement') then
    if tg_op='DELETE' then raise exception 'immutable gongzhi history'; end if;
    if (to_jsonb(new)-array['retrievals','views','reply_count','last_reply_at','updated_at','tsv']) is distinct from
       (to_jsonb(old)-array['retrievals','views','reply_count','last_reply_at','updated_at','tsv']) then
      raise exception 'immutable gongzhi history';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
