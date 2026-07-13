# Frontend API Contract - GAD Canar

This is the verified API contract for the backend currently integrated in origin/feature.
It is derived from controllers, DTOs, guards, services, the document policy, and
critical tests. It does not replace server-side authorization.

## 1. General information

- Local base URL: http://localhost:3000/api/v1
- Local Swagger URL: http://localhost:3000/api/docs
- Default backend port: 3000
- Swagger is enabled only outside production mode.
- All identifiers and values in this document are synthetic.

Configure one frontend base URL that already includes /api/v1. Do not append the
prefix again in API helpers.

## 2. Base URL, CORS, and transport

CORS accepts the configured FRONTEND_URL, or http://localhost:5173 locally. It
allows credentials, Content-Type, and Authorization. It exposes
Content-Disposition and Content-Length to the browser.

For browser calls use credentials: include with fetch, or withCredentials: true
with Axios. Cookie sessions are the primary browser integration. The access JWT
can also be sent as Authorization: Bearer token when a client legitimately has
one; the JWT strategy accepts it as a fallback.

## 3. Authentication and cookies

POST /auth/login writes access_token and refresh_token as HttpOnly cookies.
They are not returned in JSON and frontend JavaScript must not read them.

| Cookie | Lifetime | Path | Development | Production |
| --- | --- | --- | --- | --- |
| access_token | 15 minutes | default | Secure=false, SameSite=Lax | Secure=true, SameSite=Strict |
| refresh_token | 7 days | /api/v1/auth | Secure=false, SameSite=Lax | Secure=true, SameSite=Strict |

Do not store a refresh token in localStorage. Refresh uses the existing HttpOnly
cookie and rotates its server session. Logout revokes active sessions and clears
both cookies.

### Authentication endpoints

| Method and path | Auth | Body | Success result | Controlled errors |
| --- | --- | --- | --- | --- |
| POST /auth/login | Public | email, password (minimum 6 chars) | success=true, data.user with id, email, role; cookies set | 401 invalid credentials, inactive account, unverified email, or missing role |
| POST /auth/refresh | refresh cookie | none | success=true; cookies rotated | 401 missing, expired, revoked, invalid, inactive, or unverified session |
| POST /auth/logout | access cookie or Bearer | none | success=true, message | 401 missing or invalid session |

Login requires an active user, valid password, verified email, and one assigned
role. The frontend should route an unverified user to verification, not create
a local partial session.

### Registration and verification

| Method and path | Auth | DTO fields | Result |
| --- | --- | --- | --- |
| POST /users/register | Public | email, password minimum 8, optional cedula, name, lastname, direction | Creates active CITIZEN with emailVerified=false and creates an email code |
| POST /users/register-architect | Public | Same CreateUserDto | Creates active USER with emailVerified=false and creates an email code |
| POST /verification/verify-email | Public | email and 6-character code | success=true and verified email |
| POST /users/institutional | ADMINISTRATOR | CreateUserDto plus roleName | Creates institutional user; current flow does not send a verification code |

Verification codes are bcrypt validated, expire after 15 minutes, and are
cleared after successful verification. No public resend-code, password-recovery,
or password-reset endpoint exists in the current controllers.

## 4. Roles, authorization, and ownership

The exact active role names are:

ADMINISTRATOR, SECRETARY, TECHNICIAN, FINANCIAL, USER, CITIZEN.

ADMINISTRATOR passes every role guard. Request services add ownership checks:

- CITIZEN: only request.citizen_id equal to the authenticated id.
- USER: only request.architect_id equal to the authenticated id.
- SECRETARY, TECHNICIAN, FINANCIAL: institutional request access for read,
  list, and upload actions.
- Attachment deletion is stricter: administrator and secretary may delete any
  attachment; USER may delete attachments only in its own filings.

The UI should hide unauthorized controls, but must always handle HTTP 403. The
server remains the authority for role and ownership decisions.

## 5. HTTP conventions

- JSON requests use Content-Type: application/json.
- File uploads use multipart/form-data. Do not set the multipart boundary
  manually when using FormData.
- Downloads must be read as Blob responses.
- Request and attachment ids are path parameters.
- Most endpoints return { success: true, data: ... }.
- IPFS, blockchain, and attachment integrity return their operational object
  directly and still include success.

## 6. Users and role administration

### User endpoints

| Method and path | Roles | Query or body | Response |
| --- | --- | --- | --- |
| GET /users | ADMINISTRATOR, SECRETARY | optional role, optional limit; default 100 and maximum 500 | success=true, data=User[] |
| GET /users/technicians | SECRETARY, ADMINISTRATOR | none | success=true, data=User[] |
| GET /users/dashboard/stats | ADMINISTRATOR | none | success=true, data contains totalUsers and activeTechnicians |
| GET /users/:id | ADMINISTRATOR, SECRETARY | path id | success=true, data=User |
| PATCH /users/:id | ADMINISTRATOR, SECRETARY | optional name, lastname, direction, cedula, password | success=true, data=User |
| PATCH /users/:id/status | ADMINISTRATOR, SECRETARY | status ACTIVE or INACTIVE | success=true, data=User |
| DELETE /users/:id | ADMINISTRATOR | path id | success=true, data=User |

Public user results include id, email, profile fields, status, emailVerified,
and timestamps. They do not include password hashes or verification codes.

### Role and permission endpoints

These are administrative UI endpoints.

| Method and path | Roles | Input |
| --- | --- | --- |
| GET /roles/permissions | ADMINISTRATOR | none |
| POST /roles/permissions | ADMINISTRATOR | name, optional description |
| PATCH /roles/permissions/:id | ADMINISTRATOR | optional name, description |
| DELETE /roles/permissions/:id | ADMINISTRATOR | none |
| POST /roles/assign | ADMINISTRATOR, SECRETARY | userId, roleName |
| GET /roles/users/:userId/permissions/breakdown | ADMINISTRATOR | none |
| GET /roles/users/:userId/permissions/direct | ADMINISTRATOR | none |
| PUT /roles/users/:userId/permissions | ADMINISTRATOR | permissionIds array |
| GET /roles/users/:userId/permissions | ADMINISTRATOR, SECRETARY | none |
| GET /roles | ADMINISTRATOR | none |
| POST /roles | ADMINISTRATOR | name, optional description |
| GET /roles/:id | ADMINISTRATOR | none |
| PATCH /roles/:id | ADMINISTRATOR | optional name, description |
| PUT /roles/:id/permissions | ADMINISTRATOR | permissionIds array |
| DELETE /roles/:id | ADMINISTRATOR | none |

## 7. Requests and procedure folders

### Valid values

| Field | Valid values |
| --- | --- |
| request_type | CONSTRUCTION_PERMIT, BUILDING_LINE, PLAN_APPROVAL |
| property.zone | URBAN, RURAL |
| status | DRAFT, PENDING_SECRETARY, OBSERVED, PENDING_TECHNICIAN, INSPECTION, PENDING_PAYMENT, PAID, APPROVED, REJECTED |

### Create and query

| Method and path | Roles | Input or filter | Response |
| --- | --- | --- | --- |
| POST /requests | CITIZEN, USER, ADMINISTRATOR | CreateRequestDto | success=true, data=Request |
| GET /requests/my-requests | Any authenticated role in current controller; intended for citizen portal | none | Requests filtered by current id as citizen_id |
| GET /requests/my-filings | USER, ADMINISTRATOR | none | Requests filtered by current id as architect_id |
| GET /requests | SECRETARY, ADMINISTRATOR, TECHNICIAN, FINANCIAL | optional status | All matching requests |
| GET /requests/:id | All six roles plus service ownership | path id | Detail with property, history, attachments, inspection, resolution, secretary decision |

Example create body:

~~~json
{
  "request_type": "BUILDING_LINE",
  "citizen_id": "00000000-0000-4000-8000-000000000001",
  "property": {
    "cadastral_key": "synthetic-cadastral-key",
    "address": "Synthetic address",
    "area": 120,
    "zone": "URBAN"
  }
}
~~~

For USER, citizen_id is required. For CITIZEN, the service uses the authenticated
id as citizen_id. PLAN_APPROVAL requires an already approved BUILDING_LINE for
that citizen. The DTO accepts an optional phone value, but the current request
persistence and response model do not retain it; the frontend must not rely on
that field.

### Institutional workflow

| Method and path | Roles | Body | Result |
| --- | --- | --- | --- |
| POST /requests/:id/secretary-review | SECRETARY, ADMINISTRATOR | signature_validated, approved, optional remarks | id, status, signature_validated, approved |
| PATCH /requests/:id/status | SECRETARY, ADMINISTRATOR, TECHNICIAN, FINANCIAL | status, optional comment | Updated request |
| POST /requests/:id/schedule | SECRETARY, ADMINISTRATOR | date ISO-8601, technician, optional comments | id, status=INSPECTION |
| POST /requests/:id/inspection-report | TECHNICIAN, ADMINISTRATOR | multipart photos, optional comments | id and current status |
| POST /requests/:id/resolve | TECHNICIAN, SECRETARY, ADMINISTRATOR, FINANCIAL | optional approved, required comments | id, status, payment_amount, calculation_detail |

Secretary review accepts only PENDING_SECRETARY and OBSERVED requests. Approval
moves to PENDING_TECHNICIAN; observation moves to OBSERVED. A non-validated
signature produces an informational history alert but does not block approval.

Resolution treats approved=false as rejection. Approval calculates the payment
amount on the backend and moves to PENDING_PAYMENT. Rejection moves to REJECTED.
There is no dedicated public payment-processing endpoint. There is also no
separate history or assignment endpoint; history is included in detail and
traceability results.

## 8. Documents and attachments

| Method and path | Roles | Ownership | Result |
| --- | --- | --- | --- |
| POST /requests/:id/attachments | All six roles | Owner or institutional access | success=true, data=Attachment without internal URL |
| GET /requests/:id/attachments | All six roles | Owner or institutional access | success=true, data=Attachment[] without internal URL |
| GET /requests/:id/attachments/:attachmentId/download | All six roles | Owner or institutional access | Binary stream |
| GET /requests/:id/attachments/:attachmentId/verify | All six roles | Owner or institutional access | Direct integrity result |
| DELETE /requests/:id/attachments/:attachmentId | SECRETARY, USER, ADMINISTRATOR | USER only for own filing | deleted=true, attachment_id |

Attachment FormData fields:

| Field | Required | Value |
| --- | --- | --- |
| file | Yes | One binary file |
| folder | Yes | PLANOS, DOCUMENTOS_LEGALES, INFORMES, or OTROS |
| name | No | Sanitized display name; original file name when omitted |

The document policy permits PDF, PNG, JPG/JPEG, DOC, and DOCX up to 10 MB.
It requires a non-empty file, safe name, matching extension and MIME type, and
a lightweight binary signature. Inspection report uses the photos field, allows
at most five files, permits only PNG/JPG/JPEG, and accepts optional comments.

Invalid file metadata, MIME, content signature, or workflow input returns 400.
Multipart size limits return 413. The current contract does not emit dedicated
415 errors; unsupported file types are validated as 400.

### Secure download

Never construct a public link from attachment.url and never call /uploads paths
directly. Use the authenticated download endpoint and consume it as a Blob.

The download response includes Content-Type, Content-Disposition, Content-Length,
and X-Content-Type-Options: nosniff. PDF, PNG, and JPEG use inline disposition;
other allowed types use attachment disposition. Read the filename from
Content-Disposition when present.

## 9. SHA-256 integrity

GET /requests/:id/attachments/:attachmentId/verify recalculates SHA-256 from
the authorized physical file and compares it with the stored hash. SHA-256 has
64 hexadecimal characters and validates stored content integrity; it is not a
digital signature.

~~~json
{
  "success": true,
  "valid": true,
  "verifiable": true,
  "attachment_id": "synthetic-attachment-id",
  "stored_hash": "synthetic-64-character-hex-hash",
  "current_hash": "synthetic-64-character-hex-hash",
  "message": "Attachment integrity is valid."
}
~~~

| State | verifiable | valid | UI text |
| --- | --- | --- | --- |
| Hashes match | true | true | Integro |
| Hashes differ | true | false | Integridad invalida |
| No stored hash | false | false | No verificable |
| Physical file unavailable | HTTP 404 | N/A | Controlled not-found state |

Do not show a non-verifiable attachment as altered.

## 10. IPFS

POST /requests/:id/attachments/:attachmentId/ipfs requires ADMINISTRATOR or
SECRETARY, request access, an attachment belonging to the request, and a local
file. It returns an operational object directly.

Disabled mode:

~~~json
{
  "success": true,
  "enabled": false,
  "uploaded": false,
  "ipfs_status": "DISABLED",
  "message": "IPFS integration is disabled by configuration."
}
~~~

Successful mode returns attachment_id, ipfs_cid, ipfs_status=UPLOADED,
ipfs_provider, and ipfs_uploaded_at. A second request returns
already_uploaded=true with the stored CID. Retry candidates are PENDING and
FAILED; an UPLOADING attachment can return 409.

A CID is not an HTTP URL. Do not create a gateway link in the frontend unless a
future backend response explicitly provides a safe gateway URL.

## 11. Blockchain evidence anchoring

POST /requests/:id/attachments/:attachmentId/blockchain requires
ADMINISTRATOR or SECRETARY, request access, an attachment hash, and an IPFS CID.
It returns an operational object directly.

Disabled mode:

~~~json
{
  "success": true,
  "enabled": false,
  "anchored": false,
  "blockchain_status": "DISABLED"
}
~~~

Successful mode returns attachment_id, blockchain_status=ANCHORED,
blockchain_tx_hash, blockchain_anchored_at, blockchain_network,
blockchain_contract_address, blockchain_evidence_id, and block_number. A
repeated request returns already_anchored=true. Retry candidates are PENDING
and FAILED; ANCHORING can return 409.

A Hardhat-local network has no public explorer. The UI may abbreviate a
transaction hash for display and offer copy, but must not invent an explorer
link. Private keys are backend configuration and never frontend data.

## 12. Audit and Hash Chain

| Method and path | Roles | Response |
| --- | --- | --- |
| GET /audit | ADMINISTRATOR | success=true, data=AuditEvent[] |
| GET /audit/verify | ADMINISTRATOR | success=true, valid, message, checked_logs, legacy_logs when valid |

For UI, consume only action, user_email, details, current_hash, and created_at.
Do not render or depend on previous_hash, IP addresses, or persistence fields
outside this allowlist, even if an administrator response contains extra
internal fields.

audit/verify recalculates the Hash Chain. valid=true means checked logs form a
consistent chain. legacy_logs counts older entries without current_hash; it does
not consult a public blockchain. An invalid result includes failed_log_id and
reason.

## 13. Consolidated traceability

GET /requests/:id/traceability is available to all six roles with service-level
ownership checks. It returns success=true with data containing:

- request: id, request_type, status, created_at, updated_at.
- history: status transitions, comments, responsible, created_at.
- attachments: public metadata, sha256_hash, integrity, ipfs, blockchain.
- audit_events: action, actor_email, actor_role, created_at, current_hash.
- summary: attachment and audit-event counts.

Attachment objects intentionally omit storage URLs. The report also excludes
physical paths, previous_hash, secrets, and private keys. Use secure download
for file contents.

## 14. Error model

HttpException responses use:

~~~json
{
  "success": false,
  "statusCode": 403,
  "message": "Controlled message or validation array",
  "timestamp": "2026-01-01T00:00:00.000Z",
  "path": "/api/v1/example"
}
~~~

| Code | Meaning | Frontend action |
| --- | --- | --- |
| 400 | DTO, workflow, document metadata, MIME, signature, missing CID/hash | Show validated form error |
| 401 | Invalid credentials/session, inactive or unverified user, refresh failure | Refresh once when appropriate, then clear state and go to login |
| 403 | Role or ownership denied | Show No tienes permisos; do not retry |
| 404 | Request, attachment, inspection, user, or physical file missing | Show not-found state and refresh list when relevant |
| 409 | Conflict, IPFS upload/anchoring in progress, or already anchored evidence | Refresh current state before retry |
| 413 | File above 10 MB | Show 10 MB limit |
| 415 | Not emitted as a dedicated current contract response | Treat unsupported format response as 400 |
| 500 | Unexpected failure | Show generic error, never internal details |

Validation message can be a string or an array.

## 15. Pagination and filters

| Endpoint | Supported query | Behavior |
| --- | --- | --- |
| GET /requests | status | Optional enum filter; no pagination metadata |
| GET /requests/:id/attachments | folder | Optional folder filter; no pagination metadata |
| GET /users | role, limit | limit defaults to 100 and is capped at 500; no pagination metadata |

Do not send or expect page, pages, total, search, or date-range query values for
the current request contract.

## 16. Permission matrix for main frontend flows

Own means the service verifies the authenticated user owns the request.

| Function | ADMINISTRATOR | SECRETARY | TECHNICIAN | FINANCIAL | USER | CITIZEN |
| --- | --- | --- | --- | --- | --- | --- |
| Create request | Yes | No | No | No | Yes, citizen_id required | Yes |
| My citizen requests | Current id filter | Current id filter | Current id filter | Current id filter | Current id filter | Yes |
| My professional filings | Yes | No | No | No | Yes | No |
| List all requests | Yes | Yes | Yes | Yes | No | No |
| Detail and traceability | Yes | Institutional | Institutional | Institutional | Own | Own |
| Secretary review and schedule | Yes | Yes | No | No | No | No |
| Inspection report | Yes | No | Yes | No | No | No |
| Resolve and status update | Yes | Yes | Yes | Yes | No | No |
| Attachment upload/list/download/verify | Yes | Institutional | Institutional | Institutional | Own | Own |
| Attachment delete | Yes | Yes | No | No | Own filing only | No |
| IPFS and blockchain action | Yes | Yes | No | No | No | No |
| Audit endpoints | Yes | No | No | No | No | No |

The my-requests route has no role decorator in the current controller. It is
technically available to any authenticated session and filters by its id as
citizen_id. Use it only in the citizen portal.

## 17. Fields prohibited for UI integration

The frontend must not use, construct, persist, or display:

- attachment.url or any /uploads path.
- Filesystem paths, including Windows paths.
- previous_hash.
- Passwords, password hashes, verification codes, cookies, JWTs, refresh token
  values, private keys, or provider credentials.
- A synthetic gateway URL built from an IPFS CID.

## 18. Legacy routes

Do not use these route families:

- /solicitudes
- /anexos
- /api/v1/files

The current backend src tree has no matching legacy route declarations. Use
/requests and its /attachments subresources.

## 19. Frontend integration checklist

### Required

- Use one base URL ending in /api/v1.
- Send browser credentials.
- Do not read HttpOnly cookies or store a refresh token.
- Use current /requests routes only.
- Use FormData for file upload.
- Download with authenticated Blob requests.
- Handle 401, 403, 404, and 413 visibly.
- Render integrity as valid, invalid, or non-verifiable.
- Render IPFS and blockchain from backend states only.

### Optional

- Build a timeline from traceability history, attachments, and audit_events.
- Add copy controls for CID, evidence id, and transaction hash.
- Refresh state after 409 rather than issuing duplicate IPFS or blockchain calls.

### Not currently implemented

- Verification-code resend.
- Password recovery/reset.
- Dedicated payment processing.
- Public IPFS gateway browsing.

## 20. Known limitations and Swagger notes

The runtime contract is authoritative. Swagger includes controllers, tags, and
core operations, but not every endpoint has a complete success/error schema. In
particular, inspection-report declares multipart consumption and the photos
interceptor, but does not declare an explicit binary ApiBody schema in Swagger;
this document provides the verified field names.

This contract does not replace E2E checks for browser CORS, real email, Kubo
IPFS, a deployed blockchain contract, or production PostgreSQL behavior.
