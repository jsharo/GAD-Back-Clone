const assert = require('node:assert/strict');
const { ethers } = require('hardhat');

describe('DocumentEvidenceRegistry', function () {
  const evidence = {
    requestId: 'request-test-001',
    attachmentId: 'attachment-test-001',
    sha256Hash: 'hash-test-001',
    ipfsCid: 'QmSyntheticCid001',
    actor: 'actor-test-001',
  };

  function buildEvidenceId() {
    const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
      ['string', 'string', 'string', 'string'],
      [
        evidence.requestId,
        evidence.attachmentId,
        evidence.sha256Hash,
        evidence.ipfsCid,
      ],
    );

    return ethers.keccak256(encoded);
  }

  async function deployRegistry() {
    const registry = await ethers.deployContract('DocumentEvidenceRegistry');
    await registry.waitForDeployment();
    return registry;
  }

  it('anchors evidence, emits the event, and stores metadata', async function () {
    const registry = await deployRegistry();
    const evidenceId = buildEvidenceId();
    const transaction = await registry.anchorEvidence(
      evidenceId,
      evidence.requestId,
      evidence.attachmentId,
      evidence.sha256Hash,
      evidence.ipfsCid,
      evidence.actor,
    );
    const receipt = await transaction.wait();
    const event = receipt.logs
      .map((log) => {
        try {
          return registry.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((log) => log?.name === 'DocumentEvidenceAnchored');

    assert.ok(event, 'DocumentEvidenceAnchored event was not emitted');
    assert.equal(event.args.evidenceId, evidenceId);
    assert.equal(event.args.requestId, evidence.requestId);
    assert.equal(event.args.attachmentId, evidence.attachmentId);
    assert.equal(event.args.sha256Hash, evidence.sha256Hash);
    assert.equal(event.args.ipfsCid, evidence.ipfsCid);
    assert.equal(event.args.actor, evidence.actor);

    const stored = await registry.getEvidence(evidenceId);
    assert.equal(stored.evidenceId, evidenceId);
    assert.equal(stored.requestId, evidence.requestId);
    assert.equal(stored.attachmentId, evidence.attachmentId);
    assert.equal(stored.sha256Hash, evidence.sha256Hash);
    assert.equal(stored.ipfsCid, evidence.ipfsCid);
    assert.equal(stored.actor, evidence.actor);
    assert.ok(stored.timestamp > 0n);
    assert.equal(stored.exists, true);
  });

  it('rejects a duplicate evidence ID', async function () {
    const registry = await deployRegistry();
    const evidenceId = buildEvidenceId();
    const argumentsList = [
      evidenceId,
      evidence.requestId,
      evidence.attachmentId,
      evidence.sha256Hash,
      evidence.ipfsCid,
      evidence.actor,
    ];

    await (await registry.anchorEvidence(...argumentsList)).wait();

    await assert.rejects(
      registry.anchorEvidence(...argumentsList),
      /Evidence already anchored/,
    );
  });
});
