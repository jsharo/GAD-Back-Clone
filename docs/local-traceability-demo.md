# Local Traceability Demo Guide

## 1. Purpose

This guide documents how to reproduce the local document traceability demo for the GAD Canar backend:

```text
Request -> Attachment -> SHA-256 -> IPFS CID -> Blockchain tx -> Audit log -> audit/verify
```

The goal is to validate that a synthetic document can be attached to a request, hashed, uploaded to a local Kubo/IPFS node, anchored in a local Hardhat blockchain, and verified through the audit hash chain.

## 2. Scope

This procedure is for local development and demo environments only.

Do not use this guide for production deployments, public networks, real IPFS pinning providers, mainnet, testnet, or sensitive documents.

## 3. Prerequisites

- Windows PowerShell.
- Backend repository checked out locally.
- PostgreSQL configured for the backend.
- Backend dependencies already installed.
- Kubo CLI installed outside the project, for example:

```text
C:\Tools\kubo\kubo\ipfs.exe
```

- Hardhat dependencies already present in the backend project.
- A local test request ID available.
- A verified user with permission to upload, send to IPFS, anchor to blockchain, and read audit logs.

## 4. Kubo/IPFS Installation And Verification

Verify Kubo:

```powershell
C:\Tools\kubo\kubo\ipfs.exe version
```

Initialize the IPFS repository only if it does not exist yet:

```powershell
C:\Tools\kubo\kubo\ipfs.exe init
```

If the repository already exists, do not force reinitialization.

Start the daemon in a dedicated terminal:

```powershell
C:\Tools\kubo\kubo\ipfs.exe daemon
```

In another terminal, verify the node:

```powershell
C:\Tools\kubo\kubo\ipfs.exe id
```

## 5. IPFS Commands For A Local Smoke Test

Create a synthetic file outside the project:

```powershell
$test = "$env:TEMP\avance23-ipfs-smoke-test.txt"
"Local IPFS demo file - no sensitive data" | Set-Content $test
```

Add it to IPFS:

```powershell
C:\Tools\kubo\kubo\ipfs.exe add $test
```

Copy the generated CID and verify the content:

```powershell
C:\Tools\kubo\kubo\ipfs.exe cat <cid>
```

Open or test the local gateway:

```text
http://127.0.0.1:8080/ipfs/<cid>
```

## 6. IPFS Ports

Kubo must expose:

```text
API:     127.0.0.1:5001
Gateway: 127.0.0.1:8080
```

Verify ports:

```powershell
netstat -ano | findstr ":5001"
netstat -ano | findstr ":8080"
```

## 7. Hardhat Local Blockchain

From the backend repository:

```powershell
npx.cmd hardhat --version
npx.cmd hardhat compile
npx.cmd hardhat test
```

Start a local Hardhat node in a dedicated terminal:

```powershell
npx.cmd hardhat node
```

Expected local RPC:

```text
http://127.0.0.1:8545
```

Expected chain ID:

```text
31337
```

## 8. Contract Deployment

The local evidence contract is:

```text
DocumentEvidenceRegistry
```

If the deploy script exists, deploy with:

```powershell
npx.cmd hardhat run scripts/deploy-document-evidence.js --network localhost
```

Copy the printed contract address:

```text
DOCUMENT_EVIDENCE_CONTRACT_ADDRESS=<contract_address>
```

Use this address only for the local demo.

## 9. Temporary Environment Variables

Before changing `.env`, create a local backup:

```powershell
copy .env .env.avance23-1.backup
```

Confirm `.env` is ignored by Git:

```powershell
git check-ignore -v .env
```

Set these values temporarily in `.env`:

```env
IPFS_ENABLED=true
IPFS_PROVIDER=kubo-local
IPFS_API_URL=http://127.0.0.1:5001
IPFS_GATEWAY_URL=http://127.0.0.1:8080/ipfs
IPFS_UPLOAD_MODE=manual

BLOCKCHAIN_ENABLED=true
BLOCKCHAIN_PROVIDER=hardhat-local
BLOCKCHAIN_RPC_URL=http://127.0.0.1:8545
BLOCKCHAIN_CHAIN_ID=31337
BLOCKCHAIN_CONTRACT_ADDRESS=<contract_address>
BLOCKCHAIN_NETWORK_NAME=hardhat-local
BLOCKCHAIN_PRIVATE_KEY=<hardhat_local_private_key_masked>
```

Use only a local Hardhat private key. Never use or expose production keys.

## 10. Restore `.env`

After the demo, restore the original local configuration:

```powershell
copy .env.avance23-1.backup .env
```

Then verify that IPFS and blockchain are disabled again if that is the normal local mode:

```env
IPFS_ENABLED=false
BLOCKCHAIN_ENABLED=false
```

Do not commit `.env` or `.env.avance23-1.backup`.

## 11. Start Backend

With Kubo and Hardhat running, start the backend:

```powershell
npm.cmd run start:dev
```

Verify there are no startup errors related to:

- IPFS.
- Kubo API.
- Blockchain RPC.
- Contract address.
- Private key.
- Ethers.
- Audit service.

## 12. Test Endpoints

Use a synthetic file only.

### Login

```http
POST /api/v1/auth/login
```

Use a verified account with sufficient permissions.

### Upload Attachment

```http
POST /api/v1/requests/:id/attachments
```

Expected result:

- Attachment created.
- `hash` stored.
- `ipfs_status` starts as `PENDING`.
- `blockchain_status` starts as `PENDING`.

### List Attachments

```http
GET /api/v1/requests/:id/attachments
```

Expected result:

- New attachment appears in the response.

### Verify SHA-256

```http
GET /api/v1/requests/:id/attachments/:attachmentId/verify
```

Expected result:

```json
{
  "success": true,
  "valid": true,
  "verifiable": true
}
```

### Upload To IPFS

```http
POST /api/v1/requests/:id/attachments/:attachmentId/ipfs
```

Expected result:

```json
{
  "success": true,
  "enabled": true,
  "uploaded": true,
  "ipfs_status": "UPLOADED",
  "ipfs_provider": "kubo-local"
}
```

Save the generated CID and verify it:

```powershell
C:\Tools\kubo\kubo\ipfs.exe cat <cid>
```

Gateway:

```text
http://127.0.0.1:8080/ipfs/<cid>
```

### Anchor In Local Blockchain

```http
POST /api/v1/requests/:id/attachments/:attachmentId/blockchain
```

Expected result:

```json
{
  "success": true,
  "enabled": true,
  "anchored": true,
  "blockchain_status": "ANCHORED"
}
```

Save:

- `blockchain_tx_hash`.
- `blockchain_evidence_id`.
- `blockchain_contract_address`.
- `blockchain_network`.

### Audit Logs

```http
GET /api/v1/audit
```

Expected events:

- `LOGIN`.
- `UPLOAD_ATTACHMENT`.
- `IPFS_UPLOAD_SUCCESS`.
- `BLOCKCHAIN_ANCHOR_SUCCESS`.

### Audit Hash Chain

```http
GET /api/v1/audit/verify
```

Expected result:

```json
{
  "success": true,
  "valid": true
}
```

## 13. Expected Evidence

Collect the following evidence for the demo:

- Request ID.
- Attachment ID.
- Attachment name.
- Attachment size.
- SHA-256 hash.
- Integrity response with `valid: true`.
- IPFS CID.
- IPFS status `UPLOADED`.
- IPFS provider `kubo-local`.
- Gateway `200 OK`.
- Blockchain status `ANCHORED`.
- Evidence ID.
- Transaction hash.
- Contract address.
- Network `hardhat-local`.
- Audit events.
- `audit/verify` with `valid: true`.

## 14. Safe Shutdown

Stop the backend:

```text
Ctrl + C
```

Stop Hardhat node:

```text
Ctrl + C
```

Kubo may remain running if it was already active before the demo. If it was started only for the demo, stop it with:

```text
Ctrl + C
```

Confirm ports:

```powershell
netstat -ano | findstr ":3000"
netstat -ano | findstr ":8545"
netstat -ano | findstr ":5001"
netstat -ano | findstr ":8080"
```

## 15. Troubleshooting

### `ipfs` is not recognized

Use the absolute path:

```powershell
C:\Tools\kubo\kubo\ipfs.exe version
```

Then add the Kubo folder to the user `PATH`.

### Kubo API is not reachable

Check that the daemon is running:

```powershell
C:\Tools\kubo\kubo\ipfs.exe id
netstat -ano | findstr ":5001"
```

### Gateway does not return the file

Check:

```powershell
C:\Tools\kubo\kubo\ipfs.exe cat <cid>
```

If `cat` works but gateway fails, restart the Kubo daemon.

### Blockchain endpoint says CID is required

Run the IPFS endpoint first:

```http
POST /api/v1/requests/:id/attachments/:attachmentId/ipfs
```

The attachment must have `ipfs_status: UPLOADED` and an `ipfs_cid`.

### Blockchain RPC error

Verify Hardhat is running:

```powershell
netstat -ano | findstr ":8545"
```

Verify `.env`:

```env
BLOCKCHAIN_RPC_URL=http://127.0.0.1:8545
BLOCKCHAIN_CHAIN_ID=31337
```

### Invalid contract address

Deploy again locally:

```powershell
npx.cmd hardhat run scripts/deploy-document-evidence.js --network localhost
```

Update only the temporary `.env` value:

```env
BLOCKCHAIN_CONTRACT_ADDRESS=<contract_address>
```

### Audit verification fails

Do not repair data during a demo. Capture the response from:

```http
GET /api/v1/audit/verify
```

Then investigate in a separate maintenance task.

## 16. Security Rules

- Use only synthetic non-sensitive files.
- Do not upload citizen documents to local IPFS demos.
- Do not use production private keys.
- Do not display private keys in screenshots, logs, or documentation.
- Do not commit `.env`.
- Do not commit `.env.avance23-1.backup`.
- Do not commit generated files from `uploads/`.
- Do not use public testnets or mainnet for this local demo.
- Do not expose local ports beyond the machine unless explicitly required.

## 17. Final Demo Checklist

- [ ] Backend repository is clean before starting.
- [ ] `.env` backup was created.
- [ ] Kubo daemon is running.
- [ ] IPFS API `5001` is listening.
- [ ] IPFS gateway `8080` is listening.
- [ ] Hardhat node is running.
- [ ] Contract was deployed locally.
- [ ] `.env` has temporary local IPFS values.
- [ ] `.env` has temporary local blockchain values.
- [ ] Backend starts without IPFS/blockchain errors.
- [ ] Synthetic attachment uploaded.
- [ ] SHA-256 verification returns `valid: true`.
- [ ] IPFS upload returns `UPLOADED`.
- [ ] CID can be read with `ipfs cat`.
- [ ] Gateway returns the file.
- [ ] Blockchain anchor returns `ANCHORED`.
- [ ] Transaction hash was captured.
- [ ] Evidence ID was captured.
- [ ] Audit events were captured.
- [ ] `audit/verify` returns `valid: true`.
- [ ] Backend was stopped.
- [ ] Hardhat was stopped.
- [ ] `.env` was restored from backup.
- [ ] Git status is clean.
