# Change Log

## Commit 1 - November 10, 2025

### Add user-bucket flag and share mappings, SQL upgrade, and management APIs

#### IDL Changes (fm_IDL.xml)
- Added `container::user_bucket_shares` (cubs) class for managing bucket sharing with organizations
  - Fields: id, bucket (link to cub), share_org (link to aou)
- Added `container::user_bucket_usr_flags` (cubuf) class for user-specific flags per bucket
  - Fields: id, bucket, usr, flag
  - Includes permacrud configuration with STAFF_LOGIN permissions for CRUD operations
  - Context-aware permissions based on bucket's owning_lib

#### Perl Module Updates (Actor/Container.pm)
- Enabled user bucket support in `$jtypes` mapping (`$jtypes{'user'} = "cub"`)
- Implemented new API methods for user bucket sharing:
  - `open-ils.actor.container.retrieve_user_buckets_shared_with_others` - Returns user's buckets shared with others
  - `open-ils.actor.container.retrieve_user_buckets_shared_with_user` - Returns buckets shared with the requestor
  - `open-ils.actor.container.update_user_bucket_org_share_mapping` - Updates org share mappings for user buckets
  - `open-ils.actor.container.retrieve_user_bucket_shared_org_ids` - Retrieves org IDs from bucket share mappings
  - `open-ils.actor.container.update_user_bucket_user_share_mapping` - Updates user share mappings for buckets
- Extended existing methods to support user buckets:
  - `get_bucket_ids_shared_with_others` - Added user bucket logic with 'cub' object class
  - `get_bucket_ids_shared_with_user` - Added JSON query for user bucket shares
  - `update_record_bucket_org_share_mapping` - Added user bucket handling with new permission 'ADMIN_CONTAINER_USER_ORG_SHARE'
  - `retrieve_org_ids_from_record_bucket_org_share_mapping` - Added user bucket share retrieval
  - `update_container_user_shares` - Added user bucket support with 'ADMIN_CONTAINER_USER_USER_SHARE' permission
- Code improvements:
  - Fixed variable scoping in `batch_edit` method (removed caching to local variable)
  - Fixed regex split pattern for permission checking

#### Database Schema (SQL Upgrade)
- Created new upgrade script: `XXXX.schema.container.upgrade_user_buckets.sql`
- Added two new tables:
  - `container.user_bucket_usr_flags` - Stores user-specific flags per bucket
    - Columns: id (SERIAL), bucket (FK to container.user_bucket), usr (FK to actor.usr), flag (TEXT)
    - CASCADE delete on bucket removal
  - `container.user_bucket_shares` - Manages bucket sharing with organizational units
    - Columns: id (SERIAL), bucket (FK to container.user_bucket), share_org (FK to actor.org_unit)
    - CASCADE delete on bucket removal
- Added performance indexes:
  - `user_bucket_note_bucket_idx` on container.user_bucket_note(bucket)
  - `user_bucket_item_note_item_idx` on container.user_bucket_item_note(item)
  - `user_bucket_usr_flags_bucket_idx` on container.user_bucket_usr_flags(bucket)
  - `user_bucket_shares_bucket_idx` on container.user_bucket_shares(bucket)

#### New Permissions
- `ADMIN_CONTAINER_USER_ORG_SHARE` - For managing user bucket org share mappings
- `ADMIN_CONTAINER_USER_USER_SHARE` - For managing user bucket user share mappings