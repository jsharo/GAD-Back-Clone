const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { describe, test } = require('node:test');

const {
  DocumentSignatureService,
} = require('../dist/src/signatures/document-signature.service');

const FIXTURES = path.resolve(__dirname, 'fixtures/signatures');
const EXPECTED_SIGNER = {
  id: 'synthetic-citizen',
  role: 'CITIZEN',
  full_name: 'Ciudadano Demo',
  national_id: '0100000005',
};

async function verify(fileName, expectedSigner = EXPECTED_SIGNER) {
  const filePath = path.join(FIXTURES, fileName);
  const buffer = fs.readFileSync(filePath);
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  const service = new DocumentSignatureService();
  return service.verifyPdf(filePath, hash, expectedSigner);
}

describe('PDF signature verification engine', () => {
  test('reports an unsigned PDF without inventing a signer', async () => {
    const report = await verify('00-sin-firma.pdf');

    assert.equal(report.status, 'UNSIGNED');
    assert.equal(report.signature_count, 0);
    assert.equal(report.has_valid_expected_signature, false);
  });

  test('matches an intact certificate to the expected national ID', async () => {
    const report = await verify('01-firma-ciudadano-demo.pdf');

    assert.equal(report.status, 'MATCH_WITH_WARNINGS');
    assert.equal(report.signature_count, 1);
    assert.equal(report.has_valid_expected_signature, true);
    assert.equal(report.signatures[0].integrity_valid, true);
    assert.equal(report.signatures[0].identity_status, 'MATCH');
    assert.equal(report.signatures[0].trust_status, 'NOT_CONFIGURED');

    const summary = new DocumentSignatureService().buildRequestSummary(
      [
        {
          ...report,
          attachment_id: 'synthetic-attachment',
          attachment_name: '01-firma-ciudadano-demo.pdf',
          stored_hash: report.document_hash,
          storage_integrity_valid: true,
        },
      ],
      EXPECTED_SIGNER,
    );
    assert.equal(summary.requires_acknowledgement, true);
  });

  test('returns one result per signature and distinguishes an additional signer', async () => {
    const report = await verify('02-dos-firmas-ciudadano-y-secretaria.pdf');

    assert.equal(report.signature_count, 2);
    assert.equal(report.has_valid_expected_signature, true);
    assert.deepEqual(
      report.signatures.map((signature) => signature.identity_status),
      ['MATCH', 'MISMATCH'],
    );
  });

  test('detects a document altered after signing', async () => {
    const report = await verify('03-dos-firmas-con-alteracion.pdf');

    assert.equal(report.status, 'INVALID');
    assert.equal(report.has_valid_expected_signature, false);
    assert.equal(report.signatures.every((signature) => !signature.integrity_valid), true);
  });

  test('reports an explicit mismatch when the certificate ID belongs to another person', async () => {
    const report = await verify('01-firma-ciudadano-demo.pdf', {
      ...EXPECTED_SIGNER,
      id: 'different-citizen',
      full_name: 'Otra Persona',
      national_id: '0100000001',
    });

    assert.equal(report.status, 'MISMATCH');
    assert.equal(report.has_valid_expected_signature, false);
    assert.equal(report.signatures[0].identity_status, 'MISMATCH');
  });
});
