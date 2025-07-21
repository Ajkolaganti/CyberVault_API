# Changelog

All notable changes to this project will be documented in this file.

## [0.1.13] - 2025-07-21
### Fixed
- Credential creation now returns the newly created row (`select().single()`), preventing front-end `null.id` error.

## [0.1.12] - 2025-07-21
### Fixed
- Backend writes now use `supabaseAdmin` client (service-role key) to bypass RLS, resolving credential insert policy errors.
- Added `SUPABASE_SERVICE_KEY` to env sample.

## [0.1.11] - 2025-07-21
### Fixed
- Credential creation now accepts `password` field (mapped to encrypted value) and adds `database` to allowed types; prevents "data must be string" error.

## [0.1.10] - 2025-07-21
### Fixed
- Login now gracefully handles missing `profiles` row (creates one with default role) preventing `JSON object requested, multiple (or no) rows returned` error.

## [0.1.9] - 2025-07-21
### Added
- Request logger now logs incoming request data (method, path, sanitized body) and outgoing response status + duration.

## [0.1.8] - 2025-07-21
### Added
- Enhanced centralized error handler to output validation errors and stack trace (non-production).
- Auth controller now forwards validation errors to handler.

## [0.1.7] - 2025-07-21
### Added
- Re-enabled `/auth` routes for signup & login.
- `API_ENDPOINTS.json` updated to include auth section again.

## [0.1.6] - 2025-07-21
### Added
- `requestLogger` middleware for structured request timing logs via Winston.
### Fixed
- JWT middleware now falls back to `SUPABASE_JWT_SECRET` allowing Supabase-issued tokens to authenticate, resolving "Invalid token" error when adding credentials.

## [0.1.5] - 2025-07-21
### Changed
- Temporarily disabled login/register endpoints by unmounting `/auth` routes.
- `API_ENDPOINTS.json` updated to remove auth section.

## [0.1.4] - 2025-07-21
### Added
- **External Integrations**: CRUD for webhook/REST configs (Okta, Azure AD, ServiceNow, Splunk, etc.).
- Added axios dependency.
- Extended `API_ENDPOINTS.json` with integrations routes.

## [0.1.3] - 2025-07-21
### Added
- **Role Management**: list users & update roles (Admin only).
- **Access Policies**: CRUD endpoints for resource permissions (Admin only).
- **Audit Logging**: automatic request logger middleware and endpoint to fetch logs.
- Expanded `API_ENDPOINTS.json` with new routes.

## [0.1.2] - 2025-07-21
### Added
- **Session Management**: start, end, list sessions; log keystrokes, fetch logs via Supabase tables.
- Updated `API_ENDPOINTS.json` with session routes.

## [0.1.1] - 2025-07-21
### Added
- **Account Discovery**: Supabase-backed endpoints to list/get Windows, Linux, AWS, Azure accounts.
- `API_ENDPOINTS.json` file containing all current backend routes for easy frontend integration.
- Added `uuid` runtime dependency.

## [0.1.0] - 2025-07-21
### Added
- Project scaffold with **Express.js** server, security middlewares, environment config.
- Supabase integration utility.
- AES-256 encryption helper.
- Winston logger.
- Centralized error handler.
- **Auth module**: register & login endpoints backed by Supabase, JWT auth middleware, RBAC middleware.
- **Credential Vault**: encrypted CRUD endpoints with role-based filtering.
- **JIT Access Management**: request, list, and revoke Just-in-Time access sessions with expiry logic.

### Changed
- Root route aggregator updated to include new modules.

### Notes
- Replace values in `.env` with production secrets.
- Pending tasks: Account discovery, session management, policies, audit logging, integrations, Swagger docs, tests. 