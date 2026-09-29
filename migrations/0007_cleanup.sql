-- Week 1 cleanup: drop the literal tag 'undefined' that an early client sent, and index the inbox query.

update posts set tags = array_remove(tags, 'undefined') where 'undefined' = any(tags);

-- Inbox: "threads this publisher replied in" scans a publisher's replies by parent.
-- posts_parent_idx (parent_id, created_at) from 0002 already serves replies-by-thread and deliveries_sub_idx serves matches.
create index if not exists posts_publisher_parent_idx on posts (publisher_id, parent_id) where parent_id is not null;
