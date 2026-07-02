import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  AbiCoder,
  Contract,
  JsonRpcProvider,
  Wallet,
  isAddress,
  keccak256,
} from 'ethers';

const DOCUMENT_EVIDENCE_ABI = [
  'function anchorEvidence(bytes32 evidenceId, string requestId, string attachmentId, string sha256Hash, string ipfsCid, string actor)',
  'function evidenceExists(bytes32 evidenceId) view returns (bool)',
];

export type DocumentEvidencePayload = {
  requestId: string;
  attachmentId: string;
  sha256Hash: string;
  ipfsCid: string;
  actor: string;
};

export type BlockchainAnchorResult = {
  txHash: string;
  blockNumber: number;
  evidenceId: string;
  contractAddress: string;
  network: string;
  status: 'ANCHORED';
};

@Injectable()
export class BlockchainService {
  isEnabled(): boolean {
    return process.env.BLOCKCHAIN_ENABLED?.trim().toLowerCase() === 'true';
  }

  getProvider(): string {
    return process.env.BLOCKCHAIN_PROVIDER?.trim() || 'disabled';
  }

  getNetworkName(): string {
    return process.env.BLOCKCHAIN_NETWORK_NAME?.trim() || 'local';
  }

  buildEvidenceId(payload: DocumentEvidencePayload): string {
    const encoded = AbiCoder.defaultAbiCoder().encode(
      ['string', 'string', 'string', 'string'],
      [
        payload.requestId,
        payload.attachmentId,
        payload.sha256Hash,
        payload.ipfsCid,
      ],
    );

    return keccak256(encoded);
  }

  async anchorDocumentEvidence(
    payload: DocumentEvidencePayload,
  ): Promise<BlockchainAnchorResult> {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException(
        'Blockchain integration is disabled by configuration.',
      );
    }

    const rpcUrl = process.env.BLOCKCHAIN_RPC_URL?.trim();
    const privateKey = process.env.BLOCKCHAIN_PRIVATE_KEY?.trim();
    const contractAddress = process.env.BLOCKCHAIN_CONTRACT_ADDRESS?.trim();
    const configuredChainId = process.env.BLOCKCHAIN_CHAIN_ID?.trim();

    if (!rpcUrl) {
      throw new ServiceUnavailableException('BLOCKCHAIN_RPC_URL is required.');
    }
    if (!privateKey) {
      throw new ServiceUnavailableException(
        'BLOCKCHAIN_PRIVATE_KEY is required.',
      );
    }
    if (!contractAddress || !isAddress(contractAddress)) {
      throw new ServiceUnavailableException(
        'BLOCKCHAIN_CONTRACT_ADDRESS is invalid.',
      );
    }

    const evidenceId = this.buildEvidenceId(payload);

    try {
      const provider = new JsonRpcProvider(rpcUrl);
      const network = await provider.getNetwork();
      if (
        configuredChainId &&
        network.chainId !== BigInt(configuredChainId)
      ) {
        throw new ServiceUnavailableException(
          'Connected blockchain chain ID does not match configuration.',
        );
      }

      const wallet = new Wallet(privateKey, provider);
      const contract = new Contract(
        contractAddress,
        DOCUMENT_EVIDENCE_ABI,
        wallet,
      );

      if (await contract.evidenceExists(evidenceId)) {
        throw new ConflictException('Document evidence is already anchored.');
      }

      const transaction = await contract.anchorEvidence(
        evidenceId,
        payload.requestId,
        payload.attachmentId,
        payload.sha256Hash,
        payload.ipfsCid,
        payload.actor,
      );
      const receipt = await transaction.wait();

      if (!receipt || receipt.status !== 1) {
        throw new ServiceUnavailableException(
          'Blockchain transaction was not confirmed.',
        );
      }

      return {
        txHash: transaction.hash,
        blockNumber: receipt.blockNumber,
        evidenceId,
        contractAddress,
        network: this.getNetworkName(),
        status: 'ANCHORED',
      };
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }

      throw new ServiceUnavailableException(
        'Blockchain provider or contract is unavailable.',
      );
    }
  }
}
