const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { afterEach, beforeEach, describe, test } = require('node:test');

const security = require('../dist/src/requests/document-security');
const { RequestService } = require('../dist/src/requests/request.service');

const PDF_BUFFER = Buffer.from('%PDF-1.7\nsynthetic test document\n%%EOF');
const PNG_BUFFER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
]);
const JPEG_BUFFER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);

function file(name, mimetype, buffer) {
  return {
    fieldname: 'file',
    originalname: name,
    encoding: '7bit',
    mimetype,
    size: buffer.length,
    buffer,
  };
}

function createService(prisma_overrides, audit = { logAction: async () => undefined }) {
  const prisma = {
    request: {
      findUnique: async () => ({
        id: 'request-id',
        status: 'DRAFT',
        citizen_id: null,
        architect_id: null,
      }),
    },
    attachment: {},
    ...prisma_overrides,
  };
  return new RequestService(prisma, audit, {}, {}, {});
}

describe('document security policy', () => {
  let original_cwd;
  let temporary_directory;

  beforeEach(() => {
    original_cwd = process.cwd();
    temporary_directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gadca-doc-security-'));
    process.chdir(temporary_directory);
  });

  afterEach(() => {
    process.chdir(original_cwd);
    fs.rmSync(temporary_directory, { recursive: true, force: true });
  });

  test('accepts valid PDF, PNG and JPEG content', () => {
    assert.equal(
      security.validateDocumentFile(file('report.pdf', 'application/pdf', PDF_BUFFER))
        .extension,
      '.pdf',
    );
    assert.equal(
      security.validateDocumentFile(file('plan.PNG', 'image/png', PNG_BUFFER)).extension,
      '.png',
    );
    assert.equal(
      security.validateDocumentFile(file('photo.jpeg', 'image/jpeg', JPEG_BUFFER)).extension,
      '.jpeg',
    );
  });

  test('rejects missing, empty and oversized files', () => {
    assert.throws(() => security.validateDocumentFile(undefined));
    assert.throws(() =>
      security.validateDocumentFile(file('empty.pdf', 'application/pdf', Buffer.alloc(0))),
    );
    assert.throws(() =>
      security.validateDocumentFile(
        file(
          'large.pdf',
          'application/pdf',
          Buffer.alloc(security.MAX_DOCUMENT_FILE_SIZE + 1, 0x25),
        ),
      ),
    );
  });

  test('rejects unsupported extensions, MIME mismatches and forged content', () => {
    assert.throws(() =>
      security.validateDocumentFile(file('notes.txt', 'text/plain', Buffer.from('text'))),
    );
    assert.throws(() =>
      security.validateDocumentFile(file('report.pdf', 'image/png', PDF_BUFFER)),
    );
    assert.throws(() =>
      security.validateDocumentFile(
        file('renamed.pdf', 'application/pdf', Buffer.from('not a real PDF')),
      ),
    );
  });

  test('restricts inspection evidence to PNG and JPEG images', () => {
    assert.throws(() =>
      security.validateDocumentFile(
        file('report.pdf', 'application/pdf', PDF_BUFFER),
        'inspection-image',
      ),
    );
    assert.equal(
      security.validateDocumentFile(
        file('photo.jpg', 'image/jpeg', JPEG_BUFFER),
        'inspection-image',
      ).extension,
      '.jpg',
    );
  });

  test('rejects dangerous and reserved client filenames', () => {
    assert.throws(() =>
      security.validateDocumentFile(file('../../report.pdf', 'application/pdf', PDF_BUFFER)),
    );
    assert.throws(() =>
      security.validateDocumentFile(file('..\\report.pdf', 'application/pdf', PDF_BUFFER)),
    );
    assert.throws(() =>
      security.validateDocumentFile(file('CON.pdf', 'application/pdf', PDF_BUFFER)),
    );
  });

  test('generates collision-resistant names inside the authorized uploads root', () => {
    const first = security.createSafeStorageLocation('request-id', 'OTROS', '.pdf');
    const second = security.createSafeStorageLocation('request-id', 'OTROS', '.pdf');
    const uploads_root = path.resolve(temporary_directory, 'uploads');

    assert.notEqual(first.file_path, second.file_path);
    assert.equal(path.extname(first.file_path), '.pdf');
    assert.equal(path.relative(uploads_root, first.file_path).startsWith('..'), false);
    assert.throws(() =>
      security.ensurePathInsideRoot(uploads_root, path.resolve(uploads_root, '..', 'escape.pdf')),
    );
  });

  test('removes the stored file when database creation fails', async () => {
    const prisma = {
      request: {
        findUnique: async () => ({
          id: 'request-id',
          status: 'DRAFT',
          citizen_id: null,
          architect_id: null,
        }),
      },
      attachment: {
        findFirst: async () => null,
        create: async () => {
          throw new Error('synthetic database failure');
        },
      },
    };
    const service = new RequestService(
      prisma,
      { logAction: async () => undefined },
      {},
      {},
      {},
    );

    await assert.rejects(() =>
      service.uploadAttachment(
        'request-id',
        { folder: 'OTROS' },
        file('report.pdf', 'application/pdf', PDF_BUFFER),
        { id: 'admin-id', email: 'admin@example.test', role: 'ADMINISTRATOR' },
      ),
    );

    const uploads_root = path.resolve(temporary_directory, 'uploads');
    const remaining_files = fs.existsSync(uploads_root)
      ? fs.readdirSync(uploads_root, { recursive: true, withFileTypes: true })
          .filter((entry) => entry.isFile())
      : [];
    assert.equal(remaining_files.length, 0);
  });

  test('does not create a database record when filesystem writing fails', async (context) => {
    let create_calls = 0;
    const prisma = {
      request: {
        findUnique: async () => ({
          id: 'request-id',
          status: 'DRAFT',
          citizen_id: null,
          architect_id: null,
        }),
      },
      attachment: {
        findFirst: async () => null,
        create: async () => {
          create_calls += 1;
        },
      },
    };
    const service = new RequestService(
      prisma,
      { logAction: async () => undefined },
      {},
      {},
      {},
    );
    context.mock.method(fs, 'writeFileSync', () => {
      throw new Error('synthetic filesystem failure');
    });

    await assert.rejects(() =>
      service.uploadAttachment(
        'request-id',
        { folder: 'OTROS' },
        file('report.pdf', 'application/pdf', PDF_BUFFER),
        { id: 'admin-id', email: 'admin@example.test', role: 'ADMINISTRATOR' },
      ),
    );
    assert.equal(create_calls, 0);
  });

  test('keeps storage URLs internal in upload and list responses', async () => {
    let stored_attachment;
    const service = createService({
      attachment: {
        findFirst: async () => null,
        create: async ({ data }) => {
          stored_attachment = { id: 'attachment-id', ...data };
          return stored_attachment;
        },
        findMany: async () => [stored_attachment],
      },
    });
    const user = { id: 'admin-id', email: 'admin@example.test', role: 'ADMINISTRATOR' };

    const uploaded = await service.uploadAttachment(
      'request-id',
      { folder: 'OTROS' },
      file('report.pdf', 'application/pdf', PDF_BUFFER),
      user,
    );
    const listed = await service.listAttachments('request-id', undefined, user);

    assert.equal(typeof stored_attachment.url, 'string');
    assert.equal(uploaded.url, undefined);
    assert.equal(listed[0].url, undefined);
  });

  test('downloads an authorized regular file from inside uploads', async () => {
    const storage = security.createSafeStorageLocation('request-id', 'OTROS', '.pdf');
    fs.writeFileSync(storage.file_path, PDF_BUFFER);
    const attachment = {
      id: 'attachment-id',
      request_id: 'request-id',
      name: 'report.pdf',
      type: 'application/pdf',
      url: storage.url,
      hash: createHash('sha256').update(PDF_BUFFER).digest('hex'),
    };
    const service = createService({
      attachment: { findFirst: async () => attachment },
    });

    const result = await service.downloadAttachment(
      'request-id',
      'attachment-id',
      { id: 'admin-id', role: 'ADMINISTRATOR' },
    );
    assert.equal(result.file_size, PDF_BUFFER.length);
    assert.equal(result.file_path.startsWith(path.resolve(temporary_directory, 'uploads')), true);
  });

  test('rejects access from a non-owner before resolving an attachment', async () => {
    const service = createService({
      request: {
        findUnique: async () => ({
          id: 'request-id',
          status: 'DRAFT',
          citizen_id: 'owner-id',
          architect_id: null,
        }),
      },
      attachment: {
        findFirst: async () => {
          throw new Error('attachment lookup must not run');
        },
      },
    });

    await assert.rejects(() =>
      service.downloadAttachment('request-id', 'attachment-id', {
        id: 'different-id',
        role: 'CITIZEN',
      }),
    );
  });

  test('reports valid and altered SHA-256 integrity and audits verification', async () => {
    const storage = security.createSafeStorageLocation('request-id', 'OTROS', '.pdf');
    fs.writeFileSync(storage.file_path, PDF_BUFFER);
    const attachment = {
      id: 'attachment-id',
      request_id: 'request-id',
      name: 'report.pdf',
      type: 'application/pdf',
      url: storage.url,
      hash: createHash('sha256').update(PDF_BUFFER).digest('hex'),
    };
    const audit_events = [];
    const service = createService(
      { attachment: { findFirst: async () => attachment } },
      { logAction: async (...args) => audit_events.push(args) },
    );
    const user = { id: 'admin-id', email: 'admin@example.test', role: 'ADMINISTRATOR' };

    const valid = await service.verifyAttachmentIntegrity(
      'request-id',
      'attachment-id',
      user,
    );
    assert.equal(valid.valid, true);
    assert.match(valid.current_hash, /^[a-f0-9]{64}$/);

    fs.writeFileSync(storage.file_path, Buffer.from('%PDF-1.7\naltered'));
    const altered = await service.verifyAttachmentIntegrity(
      'request-id',
      'attachment-id',
      user,
    );
    assert.equal(altered.valid, false);
    assert.equal(audit_events.length, 2);
    assert.equal(audit_events.every((event) => event[2] === 'VERIFY_ATTACHMENT_INTEGRITY'), true);
  });

  test('returns a controlled error when the physical file is missing', async () => {
    const attachment = {
      id: 'attachment-id',
      request_id: 'request-id',
      url: '/uploads/expedientes/request-id/OTROS/missing.pdf',
      hash: 'a'.repeat(64),
    };
    const service = createService({
      attachment: { findFirst: async () => attachment },
    });

    await assert.rejects(() =>
      service.verifyAttachmentIntegrity(
        'request-id',
        'attachment-id',
        { id: 'admin-id', role: 'ADMINISTRATOR' },
      ),
    );
  });

  test('distinguishes a legacy attachment without a stored hash', async () => {
    const storage = security.createSafeStorageLocation('request-id', 'OTROS', '.pdf');
    fs.writeFileSync(storage.file_path, PDF_BUFFER);
    const attachment = {
      id: 'attachment-id',
      request_id: 'request-id',
      url: storage.url,
      hash: null,
    };
    const service = createService({
      attachment: { findFirst: async () => attachment },
    });

    const result = await service.verifyAttachmentIntegrity(
      'request-id',
      'attachment-id',
      { id: 'admin-id', email: 'admin@example.test', role: 'ADMINISTRATOR' },
    );
    assert.equal(result.valid, false);
    assert.equal(result.verifiable, false);
    assert.equal(result.stored_hash, null);
    assert.match(result.current_hash, /^[a-f0-9]{64}$/);
  });

  test('restores the physical file when database deletion fails', async () => {
    const storage = security.createSafeStorageLocation('request-id', 'OTROS', '.pdf');
    fs.writeFileSync(storage.file_path, PDF_BUFFER);
    const attachment = {
      id: 'attachment-id',
      request_id: 'request-id',
      name: 'report.pdf',
      url: storage.url,
    };
    const service = createService({
      attachment: {
        findFirst: async () => attachment,
        delete: async () => {
          throw new Error('synthetic database failure');
        },
      },
    });

    await assert.rejects(() =>
      service.deleteAttachment(
        'request-id',
        'attachment-id',
        { id: 'admin-id', email: 'admin@example.test', role: 'ADMINISTRATOR' },
      ),
    );
    assert.equal(fs.existsSync(storage.file_path), true);
  });

  test('deletes both the database record and physical file on success', async () => {
    const storage = security.createSafeStorageLocation('request-id', 'OTROS', '.pdf');
    fs.writeFileSync(storage.file_path, PDF_BUFFER);
    const attachment = {
      id: 'attachment-id',
      request_id: 'request-id',
      name: 'report.pdf',
      url: storage.url,
    };
    let deleted = false;
    const service = createService({
      attachment: {
        findFirst: async () => attachment,
        delete: async () => {
          deleted = true;
        },
      },
    });

    const result = await service.deleteAttachment(
      'request-id',
      'attachment-id',
      { id: 'admin-id', email: 'admin@example.test', role: 'ADMINISTRATOR' },
    );
    assert.equal(result.deleted, true);
    assert.equal(deleted, true);
    assert.equal(fs.existsSync(storage.file_path), false);
  });
});
