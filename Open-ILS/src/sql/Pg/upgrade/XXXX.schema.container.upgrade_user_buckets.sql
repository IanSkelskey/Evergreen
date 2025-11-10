BEGIN;

SELECT evergreen.upgrade_deps_block_check('XXXX', :eg_version);

-- Add SQL for upgrading user buckets here
-- Table 1: Flags per user and bucket
CREATE TABLE container.user_bucket_usr_flags (
    id SERIAL PRIMARY KEY,
    bucket INT NOT NULL REFERENCES container.user_bucket(id) ON DELETE CASCADE,
    usr INT NOT NULL REFERENCES actor.usr(id),
    flag TEXT NOT NULL
);

-- Table 2: Sharing a bucket with an org unit
CREATE TABLE container.user_bucket_shares (
    id SERIAL PRIMARY KEY,
    bucket INT NOT NULL REFERENCES container.user_bucket(id) ON DELETE CASCADE,
    share_org INT NOT NULL REFERENCES actor.org_unit(id)
);

-- Recommended indexes
CREATE INDEX user_bucket_note_bucket_idx ON container.user_bucket_note(bucket);
CREATE INDEX user_bucket_item_note_item_idx ON container.user_bucket_item_note(item);
CREATE INDEX user_bucket_usr_flags_bucket_idx ON container.user_bucket_usr_flags(bucket);
CREATE INDEX user_bucket_shares_bucket_idx ON container.user_bucket_shares(bucket);

COMMIT;