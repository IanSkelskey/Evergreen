# Angular Bucket Update

This document outlines the required database changes for the Angular Bucket functionality migration.

## Previous Implementation

Prior to this work, the Angular bucket implementation was limited in several ways:

1. **Architecture Limitations**
   - All bucket functionality was housed within the cataloging module (`Open-ILS/src/eg2/src/app/staff/cat/bucket`)
   - The implementation was primarily designed for bibliographic record buckets
   - Other bucket types (user, copy, callnumber) lacked a consistent user interface pattern

2. **Backend Support Constraints**
   - The backend code in `Container.pm` only supported record bucket sharing and favorites
   - User bucket, copy bucket, and callnumber bucket types had basic functionality but lacked advanced features:
     - No sharing with users or organizational units
     - No favorites functionality
     - No cross-module reusable components

3. **User Experience**
   - Each bucket type had its own separate implementation
   - Inconsistent user interfaces across different bucket types
   - Limited reusability of bucket functionality across staff client modules

This migration aims to create a unified architecture for all bucket types, bringing feature parity by implementing the enhanced functionality across all bucket types rather than just bibliographic record buckets.

## Database Schema Changes

The following SQL script must be executed to add the necessary database tables and indexes:

```sql
BEGIN;

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
```

## Schema Details

### New Tables

1. **user_bucket_usr_flags** - Stores user-specific flags for buckets
2. **user_bucket_shares** - Enables sharing buckets with organizational units

### Indexes

Added indexes improve query performance for bucket operations and maintain referential integrity.

## Backend API Changes

To support the new Angular Bucket functionality, especially for user buckets, the following backend API changes were implemented:

### User Bucket Type Support

- Enabled user bucket type in the system by activating the `$jtypes{'user'} = "cub";` mapping

### New API Methods

The following API methods were added to support user bucket sharing:

1. **Organization-level sharing:**
   - `open-ils.actor.container.retrieve_user_buckets_shared_with_others`
   - `open-ils.actor.container.retrieve_user_buckets_shared_with_others.count`
   - `open-ils.actor.container.update_user_bucket_org_share_mapping`
   - `open-ils.actor.container.retrieve_user_bucket_shared_org_ids`

2. **User-level sharing:**
   - `open-ils.actor.container.retrieve_user_buckets_shared_with_user`
   - `open-ils.actor.container.retrieve_user_buckets_shared_with_user.count`
   - `open-ils.actor.container.update_user_bucket_user_share_mapping`

### Updated Functions

Core bucket management functions were extended to support user buckets:
- `get_bucket_ids_shared_with_others`
- `get_bucket_ids_shared_with_user`
- `update_record_bucket_org_share_mapping`
- `retrieve_org_ids_from_record_bucket_org_share_mapping`
- `update_container_user_shares`
- `pcrud_count` (Added support for user bucket class hints)

### Permission Requirements

The following permissions were implemented for user bucket operations:
- `ADMIN_CONTAINER_USER_ORG_SHARE` - Required to share user buckets with organizations
- `ADMIN_CONTAINER_USER_USER_SHARE` - Required to share user buckets with other users

## Fieldmapper IDL Changes

The following changes were made to the Fieldmapper IDL (fm_IDL.xml) to support the new bucket functionality:

### User Bucket Class (cub) Updates

1. **Field Modifications**:
   - Added `oils_obj:required="true"` to the `pub` field to enforce this requirement
   - Added a virtual field `share_maps` to track sharing relationships

2. **Link Additions**:
   - Added link to `cubs` (user bucket shares) via the share_maps field

3. **Permission Updates**:
   - Enhanced retrieve permission to include `VIEW_CONTAINER` with public bucket visibility
   - Added support for organizational sharing via context links
   - Updated update permission to include `UPDATE_CONTAINER` with org context

### New Classes

1. **User Bucket Share Mapping (cubs)**:
   - Created a new class for tracking organizational unit sharing
   - Defines the relationship between user buckets and organizational units
   - Maps to the `container.user_bucket_shares` database table

2. **User Bucket User Flag Mapping (cubuf)**:
   - Created a new class for tracking user flags on buckets
   - Enables features like marking buckets as favorites
   - Maps to the `container.user_bucket_usr_flags` database table
   - Implements appropriate permacrud actions for staff login access

These IDL changes work in conjunction with the database schema changes and backend API updates to fully enable the enhanced bucket functionality.