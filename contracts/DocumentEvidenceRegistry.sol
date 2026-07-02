// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract DocumentEvidenceRegistry {
    struct Evidence {
        bytes32 evidenceId;
        string requestId;
        string attachmentId;
        string sha256Hash;
        string ipfsCid;
        string actor;
        uint256 timestamp;
        bool exists;
    }

    mapping(bytes32 => Evidence) private evidenceById;

    event DocumentEvidenceAnchored(
        bytes32 indexed evidenceId,
        string requestId,
        string attachmentId,
        string sha256Hash,
        string ipfsCid,
        string actor,
        uint256 timestamp
    );

    function anchorEvidence(
        bytes32 evidenceId,
        string calldata requestId,
        string calldata attachmentId,
        string calldata sha256Hash,
        string calldata ipfsCid,
        string calldata actor
    ) external {
        require(evidenceId != bytes32(0), "Evidence ID is required");
        require(!evidenceById[evidenceId].exists, "Evidence already anchored");
        require(bytes(sha256Hash).length > 0, "Document hash is required");
        require(bytes(ipfsCid).length > 0, "IPFS CID is required");

        uint256 anchoredAt = block.timestamp;
        evidenceById[evidenceId] = Evidence({
            evidenceId: evidenceId,
            requestId: requestId,
            attachmentId: attachmentId,
            sha256Hash: sha256Hash,
            ipfsCid: ipfsCid,
            actor: actor,
            timestamp: anchoredAt,
            exists: true
        });

        emit DocumentEvidenceAnchored(
            evidenceId,
            requestId,
            attachmentId,
            sha256Hash,
            ipfsCid,
            actor,
            anchoredAt
        );
    }

    function evidenceExists(bytes32 evidenceId) external view returns (bool) {
        return evidenceById[evidenceId].exists;
    }

    function getEvidence(bytes32 evidenceId) external view returns (Evidence memory) {
        require(evidenceById[evidenceId].exists, "Evidence not found");
        return evidenceById[evidenceId];
    }
}
