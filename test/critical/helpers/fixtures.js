const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const {
  createSafeStorageLocation,
} = require('../../../dist/src/requests/document-security');

const PDF_BUFFER = Buffer.from('%PDF-1.7\ncritical synthetic fixture\n%%EOF');

function makeUser(overrides = {}) {
  return {
    id: `critical-user-${randomUUID()}`,
    email: 'critical.user@example.test',
    role: 'ADMINISTRATOR',
    status: 'ACTIVE',
    emailVerified: true,
    ...overrides,
  };
}

function makeRequest(overrides = {}) {
  return {
    id: `critical-request-${randomUUID()}`,
    status: 'DRAFT',
    citizen_id: null,
    architect_id: null,
    ...overrides,
  };
}

function makeStoredAttachment(overrides = {}) {
  const request_id = overrides.request_id || `critical-request-${randomUUID()}`;
  const storage = createSafeStorageLocation(request_id, 'OTROS', '.pdf');
  fs.writeFileSync(storage.file_path, PDF_BUFFER, { flag: 'wx' });

  return {
    attachment: {
      id: `critical-attachment-${randomUUID()}`,
      request_id,
      name: 'critical-fixture.pdf',
      type: 'application/pdf',
      size: PDF_BUFFER.length,
      url: storage.url,
      hash: 'a'.repeat(64),
      ipfs_cid: null,
      ipfs_status: 'PENDING',
      ipfs_provider: null,
      ipfs_uploaded_at: null,
      blockchain_status: 'PENDING',
      blockchain_tx_hash: null,
      blockchain_anchored_at: null,
      blockchain_network: null,
      blockchain_contract_address: null,
      blockchain_evidence_id: null,
      ...overrides,
    },
    cleanup: () => {
      const request_directory = path.resolve(
        process.cwd(),
        'uploads',
        'expedientes',
        request_id,
      );
      fs.rmSync(request_directory, { recursive: true, force: true });
    },
  };
}

function makeTemporaryFile(contents = PDF_BUFFER) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gadca-critical-'));
  const file_path = path.join(directory, 'fixture.bin');
  fs.writeFileSync(file_path, contents);
  return {
    file_path,
    cleanup: () => fs.rmSync(directory, { recursive: true, force: true }),
  };
}

function makeAuditLogStore() {
  const logs = [];
  return {
    logs,
    prisma: {
      auditLog: {
        findFirst: async ({ orderBy }) => {
          if (!logs.length) return null;
          return [...logs].sort((a, b) => {
            const time = b.created_at.getTime() - a.created_at.getTime();
            return time || b.id.localeCompare(a.id);
          })[0];
        },
        create: async ({ data }) => {
          const log = { id: `critical-log-${logs.length + 1}`, ...data };
          logs.push(log);
          return log;
        },
        findMany: async () =>
          [...logs].sort((a, b) => {
            const time = a.created_at.getTime() - b.created_at.getTime();
            return time || a.id.localeCompare(b.id);
          }),
      },
    },
  };
}

module.exports = {
  PDF_BUFFER,
  makeAuditLogStore,
  makeRequest,
  makeStoredAttachment,
  makeTemporaryFile,
  makeUser,
};
