# Evergreen Bucket Components Migration Guide

## Context and Goals

This project is migrating bucket functionality from AngularJS to Angular using a generic architecture pattern. When helping with this code:

- Treat the `BucketService` as the core foundation for all bucket operations
- Encourage delegation to the generic service rather than duplicating code
- Ensure all bucket interfaces follow consistent patterns and styles
- Help maintain type safety through the `BucketClass` type system

## Architecture Patterns

Follow this architecture for all bucket-related code:
- Base operations belong in the generic `bucket.service.ts`
- Type-specific services should wrap the generic service
- Bucket types are: `biblio`, `user`, `copy`, and `callnumber`
- UI components should be consistent across bucket types

## Code Guidelines

When generating or modifying code:

- Write service methods using async/await with proper error handling
- Follow TypeScript best practices with proper typing
- Use common dialog components rather than creating new ones
- Leverage shared CSS from `buckets.css` with the `bucket-` prefix
- Implement proper component communication using services

## Implementation Patterns

For component implementations:
- Use dependency injection to obtain services and dialogs
- Apply consistent grid configurations across bucket types
- Handle async operations with proper loading states and error handling
- Follow the existing patterns in `record-bucket.component.ts`

For services:
- Create small, focused methods that do one thing well
- Delegate to the generic service for common operations
- Add type-specific methods only when necessary
- Maintain consistent naming patterns (`add*To*Bucket`, etc.)

## Style Guidelines

Apply these style conventions:
- Use the shared `bucket-component` class for root elements
- Prefer Bootstrap utilities over custom CSS when possible
- Add new shared styles to `buckets.css` for reuse across components
- Test all interfaces in both light and dark themes
- Use common prefixes for CSS classes (`bucket-action-*`, `bucket-*-dialog`)

## Documentation

When documenting code:
- Add JSDoc comments to public methods
- Explain bucket-specific logic that differs from the generic pattern
- Document any unique requirements for specific bucket types
