const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { afterEach, beforeEach, describe, test } = require('node:test');
const bcrypt = require('bcrypt');

const { AuthService } = require('../../dist/src/auth/auth.service');
const { TokensService } = require('../../dist/src/auth/tokens.service');
const { AuditService } = require('../../dist/src/audit/audit.service');
const { IpfsService } = require('../../dist/src/ipfs/ipfs.service');
const { BlockchainService } = require('../../dist/src/blockchain/blockchain.service');
const { RequestService } = require('../../dist/src/requests/request.service');
const {
  makeAuditLogStore,
  makeRequest,
  makeStoredAttachment,
  makeTemporaryFile,
  makeUser,
} = require('./helpers/fixtures');

const ENV_KEYS = [
  'IPFS_ENABLED',
  'IPFS_PROVIDER',
  'IPFS_API_URL',
  'BLOCKCHAIN_ENABLED',
  'BLOCKCHAIN_RPC_URL',
  'BLOCKCHAIN_PRIVATE_KEY',
  'BLOCKCHAIN_CONTRACT_ADDRESS',
  'BLOCKCHAIN_CHAIN_ID',
  'BLOCKCHAIN_NETWORK_NAME',
];

function restoreEnvironment(snapshot) {
  for (const key of ENV_KEYS) {
    if (snapshot[key] === undefined) delete process.env[key];
    else process.env[key] = snapshot[key];
  }
}

function makeRequestService({ request, attachment, prisma = {}, audit_events = [] } = {}) {
  const db = {
    request: { findUnique: async () => request || makeRequest() },
    attachment: { findFirst: async () => attachment },
    auditLog: { findMany: async () => [] },
    ...prisma,
  };
  return new RequestService(
    db,
    { logAction: async (...event) => audit_events.push(event) },
    {},
    {},
    {},
  );
}

describe('critical backend regression suite', () => {
  let environment;

  beforeEach(() => {
    environment = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  });

  afterEach(() => restoreEnvironment(environment));

  describe('authentication and sessions', () => {
    test('logs in an active verified user and returns the token contract', async () => {
      const user = makeUser({ id: 'verified-user' });
      let saved = 0;
      const service = new AuthService(
        { validateCredentials: async () => user, findById: async () => user },
        { getUserRoleName: async () => 'ADMINISTRATOR' },
        {
          generateTokens: async () => ({ accessToken: 'access-synthetic', refreshToken: 'refresh-synthetic' }),
          saveRefreshToken: async () => { saved += 1; },
        },
        { logAction: async () => undefined },
      );

      const result = await service.login({ email: user.email, password: 'synthetic' });

      assert.deepEqual(Object.keys(result).sort(), ['accessToken', 'refreshToken', 'user'].sort());
      assert.equal(result.user.role, 'ADMINISTRATOR');
      assert.equal(saved, 1);
    });

    test('rejects an unverified user before creating a session', async () => {
      const user = makeUser({ emailVerified: false });
      let generated = 0;
      const service = new AuthService(
        { validateCredentials: async () => user },
        { getUserRoleName: async () => 'CITIZEN' },
        { generateTokens: async () => { generated += 1; return {}; } },
        { logAction: async () => undefined },
      );

      await assert.rejects(() => service.login({ email: user.email, password: 'synthetic' }), /Email not verified/);
      assert.equal(generated, 0);
    });

    test('rejects inactive and invalid refresh sessions', async () => {
      let validate_calls = 0;
      const inactive = makeUser({ status: 'INACTIVE' });
      const service = new AuthService(
        { findById: async () => inactive },
        { getUserRoleName: async () => 'ADMINISTRATOR' },
        { validateRefreshToken: async () => { validate_calls += 1; return null; } },
        { logAction: async () => undefined },
      );

      await assert.rejects(() => service.refreshTokens(inactive.id, 'synthetic-refresh'), /Invalid refresh token/);
      assert.equal(validate_calls, 0);

      const active = makeUser();
      const invalidService = new AuthService(
        { findById: async () => active },
        { getUserRoleName: async () => 'ADMINISTRATOR' },
        { validateRefreshToken: async () => null },
        { logAction: async () => undefined },
      );
      await assert.rejects(() => invalidService.refreshTokens(active.id, 'synthetic-refresh'), /Invalid refresh token/);
    });

    test('rotates a valid refresh session and revokes the previous one', async () => {
      const user = makeUser();
      let revoked = null;
      let saved = 0;
      const service = new AuthService(
        { findById: async () => user },
        { getUserRoleName: async () => 'USER' },
        {
          validateRefreshToken: async () => ({ session_id: 'critical-session' }),
          revokeRefreshToken: async (id) => { revoked = id; },
          generateTokens: async () => ({ accessToken: 'new-access', refreshToken: 'new-refresh' }),
          saveRefreshToken: async () => { saved += 1; },
        },
        { logAction: async () => undefined },
      );

      const result = await service.refreshTokens(user.id, 'old-refresh');
      assert.equal(result.accessToken, 'new-access');
      assert.equal(revoked, 'critical-session');
      assert.equal(saved, 1);
    });

    test('logout revokes every active session', async () => {
      const user = makeUser();
      let revoked = null;
      const service = new AuthService(
        { findById: async () => user },
        {},
        { revokeAllUserTokens: async (id) => { revoked = id; } },
        { logAction: async () => undefined },
      );

      await service.logout(user.id);
      assert.equal(revoked, user.id);
    });

    test('stores refresh tokens as bcrypt hashes, never plaintext', async () => {
      const stored = [];
      const service = new TokensService(
        {
          signAsync: async () => 'synthetic-refresh-token',
          decode: () => ({ exp: Math.floor(Date.now() / 1000) + 3600 }),
        },
        { session: { create: async ({ data }) => stored.push(data) } },
      );

      await service.saveRefreshToken('critical-user', 'synthetic-refresh-token');
      assert.equal(stored.length, 1);
      assert.notEqual(stored[0].refresh_token, 'synthetic-refresh-token');
      assert.equal(await bcrypt.compare('synthetic-refresh-token', stored[0].refresh_token), true);
    });
  });

  describe('authorization, ownership and requests', () => {
    test('rejects a non-owner before attachment access', async () => {
      const request = makeRequest({ citizen_id: 'owner-id' });
      const service = makeRequestService({
        request,
        prisma: { attachment: { findFirst: async () => { throw new Error('lookup should not run'); } } },
      });

      await assert.rejects(() =>
        service.listAttachments(request.id, undefined, { id: 'other-id', role: 'CITIZEN' }),
      );
    });

    test('returns not found for an unknown request and attachment', async () => {
      const service = makeRequestService({
        request: null,
        prisma: { request: { findUnique: async () => null } },
      });
      await assert.rejects(() => service.listAttachments('missing-request', undefined, makeUser()));

      const request = makeRequest();
      const attachmentService = makeRequestService({ request, attachment: null });
      await assert.rejects(() =>
        attachmentService.downloadAttachment(request.id, 'missing-attachment', makeUser()),
      );
    });

    test('builds the traceability structure without exposing attachment URLs', async () => {
      const stored = makeStoredAttachment({ hash: null });
      const request = makeRequest({
        id: stored.attachment.request_id,
        request_type: 'BUILDING_LINE',
        created_at: new Date(),
        updated_at: new Date(),
      });
      const prisma = {
        request: {
          findUnique: async () => ({
            ...request,
            history: [],
            attachments: [stored.attachment],
          }),
        },
        auditLog: { findMany: async () => [] },
      };
      const service = makeRequestService({ request, prisma });
      try {
        const report = await service.getTraceabilityReport(request.id, makeUser());

        assert.deepEqual(
          Object.keys(report).sort(),
          ['request', 'history', 'attachments', 'audit_events', 'summary'].sort(),
        );
        assert.equal(report.attachments[0].integrity.verifiable, false);
        assert.ok(report.attachments[0].ipfs);
        assert.ok(report.attachments[0].blockchain);
        assert.equal(JSON.stringify(report).includes('/uploads/'), false);
        assert.equal(JSON.stringify(report).includes('previous_hash'), false);
      } finally {
        stored.cleanup();
      }
    });
  });

  describe('audit hash chain', () => {
    test('creates a valid chain with a null previous hash on the first log', async () => {
      const store = makeAuditLogStore();
      const service = new AuditService(store.prisma);
      await service.logAction('critical-user', 'critical@example.test', 'CRITICAL_TEST', 'synthetic event');
      await service.logAction('critical-user', 'critical@example.test', 'CRITICAL_TEST', 'synthetic event 2');

      assert.equal(store.logs[0].previous_hash, null);
      assert.match(store.logs[0].current_hash, /^[a-f0-9]{64}$/);
      assert.equal(store.logs[1].previous_hash, store.logs[0].current_hash);
      assert.equal((await service.verifyIntegrity()).valid, true);
    });

    test('detects an altered current hash and counts legacy logs', async () => {
      const store = makeAuditLogStore();
      const service = new AuditService(store.prisma);
      await service.logAction('critical-user', 'critical@example.test', 'CRITICAL_TEST', 'first');
      const first = store.logs[0];
      first.current_hash = null;
      const legacyResult = await service.verifyIntegrity();
      assert.equal(legacyResult.valid, true);
      assert.equal(legacyResult.legacy_logs, 1);

      first.current_hash = 'f'.repeat(64);
      const invalidResult = await service.verifyIntegrity();
      assert.equal(invalidResult.valid, false);
    });
  });

  describe('IPFS and blockchain preconditions', () => {
    test('keeps IPFS disabled without network access', async () => {
      delete process.env.IPFS_ENABLED;
      const service = new IpfsService();
      await assert.rejects(() => service.uploadFile('missing-synthetic-file'), /disabled/i);
    });

    test('uploads to a mocked IPFS provider and rejects a response without CID', async (context) => {
      const temporary = makeTemporaryFile();
      process.env.IPFS_ENABLED = 'true';
      process.env.IPFS_PROVIDER = 'mock-provider';
      process.env.IPFS_API_URL = 'http://127.0.0.1:5001/api/v0/add';
      const service = new IpfsService();
      service.logger = { error: () => undefined };
      let response_body = '{"Hash":"bafy-critical-cid"}';
      context.mock.method(global, 'fetch', async () => ({ ok: true, text: async () => response_body }));

      const result = await service.uploadFile(temporary.file_path);
      assert.deepEqual(result, { cid: 'bafy-critical-cid', provider: 'mock-provider' });
      response_body = '{"Name":"no-cid"}';
      await assert.rejects(() => service.uploadFile(temporary.file_path), /valid CID/i);
      temporary.cleanup();
    });

    test('IPFS request flow checks ownership before invoking the provider', async () => {
      const stored = makeStoredAttachment();
      const request = makeRequest({ id: stored.attachment.request_id, citizen_id: 'owner-id' });
      let provider_calls = 0;
      const service = makeRequestService({
        request,
        attachment: stored.attachment,
        prisma: { attachment: { findFirst: async () => stored.attachment } },
      });
      service.ipfs_service = {
        isEnabled: () => true,
        getProvider: () => 'mock-provider',
        uploadFile: async () => { provider_calls += 1; return { cid: 'bafy-cid', provider: 'mock-provider' }; },
      };

      await assert.rejects(() =>
        service.uploadAttachmentToIpfs(request.id, stored.attachment.id, { id: 'other-id', role: 'CITIZEN' }),
      );
      assert.equal(provider_calls, 0);
      stored.cleanup();
    });

    test('returns controlled disabled blockchain response and rejects missing CID', async () => {
      const stored = makeStoredAttachment({ hash: 'b'.repeat(64), ipfs_cid: null });
      const request = makeRequest({ id: stored.attachment.request_id });
      const service = makeRequestService({ request, attachment: stored.attachment });
      service.blockchain_service = { isEnabled: () => false };

      await assert.rejects(() =>
        service.anchorAttachmentEvidence(request.id, stored.attachment.id, makeUser()),
        /debe subirse a IPFS/i,
      );
      stored.attachment.ipfs_cid = 'bafy-critical-cid';
      const result = await service.anchorAttachmentEvidence(
        request.id,
        stored.attachment.id,
        makeUser(),
      );
      assert.equal(result.blockchain_status, 'DISABLED');
      stored.cleanup();
    });

    test('persists a mocked blockchain anchor and emits the success audit event', async () => {
      const stored = makeStoredAttachment({ hash: 'c'.repeat(64), ipfs_cid: 'bafy-critical-cid' });
      const request = makeRequest({ id: stored.attachment.request_id });
      const updates = [];
      const events = [];
      const service = makeRequestService({ request, attachment: stored.attachment, audit_events: events });
      service.prisma.attachment = {
        findFirst: async () => stored.attachment,
        updateMany: async () => ({ count: 1 }),
        update: async ({ data }) => ({ ...stored.attachment, ...data }),
      };
      service.blockchain_service = {
        isEnabled: () => true,
        getNetworkName: () => 'mock-network',
        buildEvidenceId: () => '0xcritical-evidence-id',
        anchorDocumentEvidence: async () => ({
          txHash: '0xcritical-tx',
          blockNumber: 7,
          evidenceId: '0xcritical-evidence-id',
          contractAddress: '0x0000000000000000000000000000000000000001',
          network: 'mock-network',
          status: 'ANCHORED',
        }),
      };

      const result = await service.anchorAttachmentEvidence(
        request.id,
        stored.attachment.id,
        makeUser(),
      );
      assert.equal(result.blockchain_status, 'ANCHORED');
      assert.equal(result.block_number, 7);
      assert.equal(events.some((event) => event[2] === 'BLOCKCHAIN_ANCHOR_SUCCESS'), true);
      assert.equal(updates.length, 0);
      stored.cleanup();
    });

    test('builds deterministic blockchain evidence IDs and validates disabled configuration', async () => {
      const service = new BlockchainService();
      const payload = {
        requestId: 'critical-request',
        attachmentId: 'critical-attachment',
        sha256Hash: 'd'.repeat(64),
        ipfsCid: 'bafy-critical-cid',
        actor: 'critical-user',
      };
      assert.equal(service.buildEvidenceId(payload), service.buildEvidenceId(payload));
      process.env.BLOCKCHAIN_ENABLED = 'false';
      await assert.rejects(() => service.anchorDocumentEvidence(payload), /disabled/i);
    });
  });
});
