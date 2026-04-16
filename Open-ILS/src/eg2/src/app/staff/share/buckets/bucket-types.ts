export type ContainerType = 'biblio' | 'user' | 'copy' | 'callnumber';
export type ContainerItemType = 'biblio_record_entry' | 'user' | 'copy' | 'call_number';
export type BucketIdlClass = 'cbreb' | 'cub' | 'ccb' | 'ccnb';
export type BucketItemIdlClass = 'cbrebi' | 'cubi' | 'ccbi' | 'ccnbi';
export type BucketFlagIdlClass = 'cbrebuf' | 'cubuf';
export type BucketShareIdlClass = 'cbrebs' | 'cubs';

export interface BucketTypeConfig {
    /** Short container type: 'biblio', 'user', 'copy', 'callnumber' */
    containerType: ContainerType;
    /** Container item type for item-level APIs: 'biblio_record_entry', 'user', 'copy', 'call_number' */
    containerItemType: ContainerItemType;
    /** IDL class for the bucket: 'cbreb', 'cub', 'ccb', 'ccnb' */
    bucketIdlClass: BucketIdlClass;
    /** IDL class for bucket items: 'cbrebi', 'cubi', 'ccbi', 'ccnbi' */
    bucketItemIdlClass: BucketItemIdlClass;
    /** Field on bucket item linking to the target object */
    targetField: string;
    /** IDL class for user flags (favorites), if supported */
    flagIdlClass?: BucketFlagIdlClass;
    /** IDL class for org-level sharing, if supported */
    shareIdlClass?: BucketShareIdlClass;
    /** Fields to flesh when loading buckets */
    bucketFleshFields: string[];
    /** Local storage key for recent bucket IDs */
    storageKey: string;
    /** Full API method name for count stats */
    countStatsApi: string;
    /** Full API method name for retrieving buckets shared with user */
    sharedWithUserApi?: string;
}

export const RECORD_BUCKET_CONFIG: BucketTypeConfig = {
    containerType: 'biblio',
    containerItemType: 'biblio_record_entry',
    bucketIdlClass: 'cbreb',
    bucketItemIdlClass: 'cbrebi',
    targetField: 'target_biblio_record_entry',
    flagIdlClass: 'cbrebuf',
    shareIdlClass: 'cbrebs',
    bucketFleshFields: ['owner', 'owning_lib'],
    storageKey: 'eg.record_bucket_log',
    countStatsApi: 'open-ils.actor.container.biblio_record_entry.count_stats.authoritative',
    sharedWithUserApi: 'open-ils.actor.container.retrieve_biblio_record_entry_buckets_shared_with_user',
};

export const USER_BUCKET_CONFIG: BucketTypeConfig = {
    containerType: 'user',
    containerItemType: 'user',
    bucketIdlClass: 'cub',
    bucketItemIdlClass: 'cubi',
    targetField: 'target_user',
    flagIdlClass: 'cubuf',
    shareIdlClass: 'cubs',
    bucketFleshFields: ['owner', 'owning_lib'],
    storageKey: 'eg.user_bucket_log',
    countStatsApi: 'open-ils.actor.container.user.count_stats.authoritative',
    sharedWithUserApi: 'open-ils.actor.container.retrieve_user_buckets_shared_with_user',
};
