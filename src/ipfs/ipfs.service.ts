import { Injectable, ServiceUnavailableException } from '@nestjs/common';

@Injectable()
export class IpfsService {
  isEnabled(): boolean {
    return process.env.IPFS_ENABLED?.trim().toLowerCase() === 'true';
  }

  getProvider(): string {
    return process.env.IPFS_PROVIDER?.trim() || 'disabled';
  }

  async uploadFile(filePath: string): Promise<never> {
    void filePath;

    if (!this.isEnabled()) {
      throw new ServiceUnavailableException(
        'IPFS integration is disabled by configuration.',
      );
    }

    throw new ServiceUnavailableException(
      'No IPFS provider has been implemented yet.',
    );
  }
}
