# Critical Backend Test Suite

## Purpose

The `test:critical` command is a fast regression gate for the backend flows that are most important before a pull request, merge, or local demonstration:

- authentication and session rotation;
- JWT-related authorization and request ownership;
- request and traceability contracts;
- document validation, storage safety, SHA-256 and cleanup;
- audit hash-chain behavior;
- IPFS and blockchain preconditions using mocks.

## Run

From the backend repository on Windows:

```powershell
npm.cmd run test:critical
```

The command compiles the NestJS application and then runs:

```text
node --test test/document-security.test.js test/critical/critical-backend.test.js
```

It currently runs 33 tests: the 16 document-security tests plus the critical service and provider tests.

## Isolation

The default suite does not require PostgreSQL test data, Kubo, Hardhat, a deployed contract, public blockchain, or SendGrid. Prisma, audit, IPFS, blockchain, and request dependencies are mocked where a real service is not needed.

Temporary files use the operating system temporary directory or an isolated synthetic uploads directory. Tests clean their files in `finally`/cleanup paths and do not run the seed or migrations.

No real credentials, tokens, cookies, private keys, citizen files, `.env` values, or database URLs are used or printed.

## What It Does Not Validate

`test:critical` is not a full HTTP or production E2E test. It does not prove CORS behavior, browser cookies, Multer wiring through a real HTTP multipart request, PostgreSQL constraints, Kubo availability, Hardhat deployment, or a real blockchain transaction.

For those checks use the existing local traceability demo guide only when the corresponding local services are available. Keep those external checks separate from `test:critical`.

## Interpreting Failures

- A build failure indicates a TypeScript or generated-client problem.
- A document test failure indicates a validation, path, hash, download, or cleanup regression.
- An authentication failure indicates a token, session, verification, or revocation regression.
- An audit failure indicates a hash-chain or legacy-log compatibility regression.
- An IPFS/blockchain failure in this suite usually indicates a precondition or mocked provider contract regression, not a missing local daemon.

The tests intentionally assert expected failures. A rejected request must remain rejected; failures are not converted into passing results.

## External Test

The real IPFS and local blockchain flow is intentionally not part of `test:critical`. Run the documented external demo only after PostgreSQL, Kubo, Hardhat, and the local contract are explicitly available.
