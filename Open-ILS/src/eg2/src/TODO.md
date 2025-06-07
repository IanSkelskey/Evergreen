# Bucket Functionality Unification Project

## Overview
This document outlines the necessary steps to unify the bucket functionality across different bucket types (record buckets, patron buckets, etc.) in the Evergreen application. The goal is to create a consistent user experience and reduce code duplication by moving shared components to a common location.

## 1. Consolidate Components into Shared Directory

### 1.1. Move Record Bucket Components to Shared Directory
- [x] Move `app/staff/cat/bucket/bucket-action-summary-dialog.component.ts` to `app/staff/share/buckets/`
- [x] Move `app/staff/cat/bucket/bucket-transfer-dialog.component.ts` to `app/staff/share/buckets/`
- [x] Move `app/staff/cat/bucket/bucket-transfer-dialog.component.html` to `app/staff/share/buckets/`
- [x] Update imports in all files that reference these components

### 1.2. Refactor Moved Components to be Generic
- [x] Modify `bucket-action-summary-dialog.component.ts` to work with any bucket type
  - [x] Replace hard-coded references to "bucket" with configurable parameters
  - [x] Add input property for bucket class type
- [x] Modify `bucket-transfer-dialog.component.ts` to work with any bucket type
  - [x] Make bucket class a configurable input
  - [x] Update service calls to use appropriate APIs based on bucket type

### 1.3. Update Module Definitions
- [x] Update `BucketModule` to include the newly moved components
- [x] Update imports in `record-bucket.module.ts` to reference the shared components

## 2. Enhance Shared Service Layer

### 2.1. Update BucketService
- [ ] Review existing `BucketService` to ensure it handles all bucket types consistently
- [ ] Add methods needed by both record and patron buckets
- [ ] Ensure methods are parameterized by bucket class ('biblio', 'user', etc.)
- [ ] Add proper type definitions for bucket operations
- [ ] Consolidate duplicate code in PatronBucketService and RecordBucketService

### 2.2. Update BucketDialogService
- [ ] Enhance to properly handle all dialog types
- [ ] Ensure the service can be used by both record and patron buckets
- [ ] Add better error handling and logging

## 3. Unify User Interface Components

### 3.1. Update Patron Bucket List Component
- [x] Update `list.component.ts` to match the tab structure of record buckets
- [x] Add missing tab views:
  - [x] "Favorites" - Show buckets marked as favorites
  - [x] "Recent" - Show recently accessed buckets
  - [x] "Shared with others" - Show buckets the user has shared
  - [x] "Shared with me" - Show buckets shared with the user
  - [x] "Visible to me" - Show all visible buckets
- [x] Update state service to track views and counts
- [x] Update template to use consistent styling with record buckets

### 3.2. Update Grid Columns
- [ ] Add share-related columns to patron bucket list:
  - [ ] "# of org shares" - Number of organizations bucket is shared with
  - [ ] "# of user view shares" - Number of users with view permissions
  - [ ] "# of user edit shares" - Number of users with edit permissions
- [ ] Ensure consistent column ordering between record and patron buckets

### 3.3. Integrate Item Transfer Dialog
- [x] Update patron bucket items component to use shared BucketItemTransferDialogComponent
- [x] Update record bucket items component to use same approach
- [x] Ensure move/copy operations work consistently

## 4. Enhance Authorization and Security

### 4.1. Move Unauthorized Component
- [x] Move `app/staff/circ/patron/bucket/unauthorized.component.ts` to `app/staff/share/buckets/`
- [x] Make it generic to work with all bucket types
- [ ] Update to use consistent share logic across bucket types

### 4.2. Update Security Checks
- [ ] Create consistent permission checking across bucket types
- [ ] Add appropriate authorization checks to all bucket operations
- [ ] Ensure share permissions are properly enforced

## 5. Update Routing Structure

### 5.1. Modify Patron Bucket Routing
- [ ] Update `routing.module.ts` for patron buckets to match record buckets structure
- [ ] Add routes for different views:
  - [ ] `/staff/circ/patron/bucket/all` - All visible buckets
  - [ ] `/staff/circ/patron/bucket/user` - User's buckets (keep default route)
  - [ ] `/staff/circ/patron/bucket/favorites` - Favorite buckets
  - [ ] `/staff/circ/patron/bucket/recent` - Recently used buckets
  - [ ] `/staff/circ/patron/bucket/shared-with-others` - Buckets shared with others
  - [ ] `/staff/circ/patron/bucket/shared-with-user` - Buckets shared with the user
  - [ ] Keep `/staff/circ/patron/bucket/unauthorized` - Access denied view
- [ ] Update component to handle these routes

### 5.2. Ensure Route Parameter Consistency
- [ ] Make route parameters consistent between bucket types
- [ ] Ensure query parameters like 'returnTo' work consistently

## 6. Implement Favorites Functionality for Patron Buckets

### 6.1. Add Favorite Flag Support
- [x] Create database tables/schema if needed for patron bucket favorites
- [x] Update patron bucket service to support favorite operations
- [x] Add UI elements (star icons) for marking favorites

### 6.2. Implement Favorites API
- [x] Add methods to add/remove favorite status
- [x] Ensure favorites are loaded when listing buckets
- [x] Add favorites filtering for the favorites tab

## 7. Enhance Sharing Functionality

### 7.1. Update Patron Bucket Sharing
- [x] Ensure patron buckets use the same sharing mechanism as record buckets
- [x] Update UI to display share information
- [x] Add appropriate sharing controls

### 7.2. Create Share API Wrapper
- [ ] Create a consistent API for sharing all bucket types
- [ ] Ensure appropriate permission checks

## 8. Update Visual Design and CSS

### 8.0. CSS Structure Overview

- [ ] **Main CSS Files**
    - `app/staff/share/buckets/buckets.css` - Shared bucket-specific styles
    - `styles-colors.css` - Global color variables and themes
    - `styles.css` - Global application styles
- [ ] Ensure bucket components use variables from global stylesheets
- [ ] Move bucket-specific styles from component CSS to shared `buckets.css`
- [ ] Document CSS naming conventions for bucket components

### 8.1. Standardize Styling
- [ ] Create shared CSS for bucket components
- [ ] Ensure consistent button styles and icons
- [ ] Apply consistent spacing and layout

### 8.2. Standardize Icons and Labels
- [ ] Use the same material icons across both components
- [ ] Ensure consistent labeling of actions and buttons

## 9. Testing and Quality Assurance

### 9.1. Create Test Cases
- [ ] Create test cases for all shared functionality
- [ ] Verify all operations work for both bucket types
- [ ] Test permission boundaries and edge cases

### 9.2. Cross-Browser Testing
- [ ] Test in Chrome, Firefox, Safari, and Edge
- [ ] Ensure responsive design works on different screen sizes

## 10. Documentation

### 10.1. Update Technical Documentation
- [ ] Document the shared bucket architecture
- [ ] Update API references
- [ ] Add examples of how to use shared components

### 10.2. Update User Documentation
- [ ] Update user guides to reflect new UI
- [ ] Document new features like favorites and sharing

## Dependency Map
- Moving components to shared directory should be done first
- Service enhancements should follow component movement
- UI updates should come after service layer is complete
- Routing updates can be done in parallel with UI work
- Testing should occur throughout the process, with final validation at the end

## Success Criteria
- Both record and patron buckets use the same shared components
- UI is consistent between bucket types
- All functionality works correctly for both bucket types
- Code is well-organized and maintainable
- Users can seamlessly switch between bucket types