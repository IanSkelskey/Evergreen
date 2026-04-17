BEGIN;

SELECT evergreen.upgrade_deps_block_check('1512', :eg_version);

CREATE TABLE container.user_bucket_shares (
    id          SERIAL      PRIMARY KEY,
    bucket      INT         NOT NULL REFERENCES container.user_bucket (id) ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED,
    share_org   INT         NOT NULL REFERENCES actor.org_unit (id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT ubs_org_once_per_bucket UNIQUE (bucket, share_org)
);

CREATE TABLE container.user_bucket_usr_flags (
    id          SERIAL      PRIMARY KEY,
    bucket      INT         NOT NULL REFERENCES container.user_bucket (id) ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED,
    usr         INT         NOT NULL REFERENCES actor.usr (id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    flag        container.usr_flag_type NOT NULL DEFAULT 'favorite',
    CONSTRAINT ubuf_flag_once_per_usr_per_bucket UNIQUE (bucket, usr, flag)
);

COMMIT;
