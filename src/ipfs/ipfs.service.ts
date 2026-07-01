import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as fs from 'fs';

export type IpfsUploadResult = {
  cid: string;
  provider: string;
};

@Injectable()
export class IpfsService {
  private readonly logger = new Logger(IpfsService.name);

  isEnabled(): boolean {
    return process.env.IPFS_ENABLED?.trim().toLowerCase() === 'true';
  }

  getProvider(): string {
    return process.env.IPFS_PROVIDER?.trim() || 'disabled';
  }

  private getUploadUrl(): URL {
    const configured_url = process.env.IPFS_API_URL?.trim();
    if (!configured_url) {
      throw new ServiceUnavailableException(
        'IPFS_API_URL is required when IPFS integration is enabled.',
      );
    }

    let upload_url: URL;
    try {
      upload_url = new URL(configured_url);
    } catch {
      throw new ServiceUnavailableException('IPFS_API_URL is invalid.');
    }

    if (!['http:', 'https:'].includes(upload_url.protocol)) {
      throw new ServiceUnavailableException(
        'IPFS_API_URL must use HTTP or HTTPS.',
      );
    }

    const normalized_path = upload_url.pathname.replace(/\/$/, '');
    if (!normalized_path.endsWith('/api/v0/add')) {
      upload_url.pathname = normalized_path.endsWith('/api/v0')
        ? `${normalized_path}/add`
        : `${normalized_path}/api/v0/add`;
    }
    upload_url.searchParams.set('pin', 'true');

    return upload_url;
  }

  private getAuthHeaders(): Record<string, string> {
    const jwt = process.env.IPFS_JWT?.trim();
    const api_key = process.env.IPFS_API_KEY?.trim();
    const api_secret = process.env.IPFS_API_SECRET?.trim();

    if (jwt) {
      return { Authorization: `Bearer ${jwt}` };
    }

    if (api_key && api_secret) {
      const credentials = Buffer.from(`${api_key}:${api_secret}`).toString(
        'base64',
      );
      return { Authorization: `Basic ${credentials}` };
    }

    if (api_key) {
      return { 'x-api-key': api_key };
    }

    return {};
  }

  private readCid(response_body: string): string | null {
    const lines = response_body
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    for (let index = lines.length - 1; index >= 0; index -= 1) {
      try {
        const parsed = JSON.parse(lines[index]);
        const cid = parsed.Hash ?? parsed.cid ?? parsed.Cid?.['/'];
        if (typeof cid === 'string' && cid.trim()) {
          return cid.trim();
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  async uploadFile(file_path: string): Promise<IpfsUploadResult> {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException(
        'IPFS integration is disabled by configuration.',
      );
    }

    const provider = this.getProvider();
    if (provider.toLowerCase() === 'disabled') {
      throw new ServiceUnavailableException(
        'IPFS_PROVIDER must be configured when IPFS integration is enabled.',
      );
    }

    let file_stats: fs.Stats;
    try {
      file_stats = await fs.promises.stat(file_path);
    } catch {
      throw new ServiceUnavailableException(
        'The local attachment is not available for IPFS upload.',
      );
    }

    if (!file_stats.isFile()) {
      throw new ServiceUnavailableException(
        'The local attachment is not available for IPFS upload.',
      );
    }

    let file_buffer: Buffer;
    try {
      file_buffer = await fs.promises.readFile(file_path);
    } catch {
      throw new ServiceUnavailableException(
        'The local attachment is not available for IPFS upload.',
      );
    }
    const form_data = new FormData();
    form_data.append(
      'file',
      new Blob([new Uint8Array(file_buffer)]),
      'attachment.bin',
    );

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const response = await fetch(this.getUploadUrl(), {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: form_data,
        signal: controller.signal,
      });
      const response_body = await response.text();

      if (!response.ok) {
        this.logger.error(
          `IPFS upload failed for provider ${provider} with status ${response.status}`,
        );
        throw new ServiceUnavailableException('IPFS provider upload failed.');
      }

      const cid = this.readCid(response_body);
      if (!cid) {
        this.logger.error(
          `IPFS provider ${provider} returned a response without a CID`,
        );
        throw new ServiceUnavailableException(
          'IPFS provider did not return a valid CID.',
        );
      }

      return { cid, provider };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      const reason =
        error instanceof Error && error.name === 'AbortError'
          ? 'request timed out'
          : 'request could not be completed';
      this.logger.error(`IPFS upload ${reason} for provider ${provider}`);
      throw new ServiceUnavailableException('IPFS provider is unavailable.');
    } finally {
      clearTimeout(timeout);
    }
  }
}
