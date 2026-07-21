import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export const MAX_DOCUMENT_FILE_SIZE = 10 * 1024 * 1024;

type AllowedFileType = {
  mime_types: readonly string[];
  signature: (buffer: Buffer) => boolean;
};

const startsWith = (buffer: Buffer, signature: readonly number[]) =>
  buffer.length >= signature.length &&
  signature.every((value, index) => buffer[index] === value);

const ALLOWED_DOCUMENT_TYPES: Readonly<Record<string, AllowedFileType>> = {
  '.pdf': {
    mime_types: ['application/pdf'],
    signature: (buffer) => buffer.subarray(0, 5).toString('ascii') === '%PDF-',
  },
  '.png': {
    mime_types: ['image/png'],
    signature: (buffer) =>
      startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  '.jpg': {
    mime_types: ['image/jpeg'],
    signature: (buffer) => startsWith(buffer, [0xff, 0xd8, 0xff]),
  },
  '.jpeg': {
    mime_types: ['image/jpeg'],
    signature: (buffer) => startsWith(buffer, [0xff, 0xd8, 0xff]),
  },
  '.doc': {
    mime_types: ['application/msword'],
    signature: (buffer) =>
      startsWith(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  },
  '.docx': {
    mime_types: [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    signature: (buffer) =>
      startsWith(buffer, [0x50, 0x4b, 0x03, 0x04]) ||
      startsWith(buffer, [0x50, 0x4b, 0x05, 0x06]) ||
      startsWith(buffer, [0x50, 0x4b, 0x07, 0x08]),
  },
};

const INSPECTION_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg']);
const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export type DocumentPolicy = 'document' | 'inspection-image';

export type ValidatedDocument = {
  extension: string;
  mime_type: string;
  display_name: string;
};

function getValidatedMetadata(
  original_name: string,
  mime_type: string,
  policy: DocumentPolicy,
) {
  const normalized_name = original_name?.trim();
  if (!normalized_name) {
    throw new BadRequestException('The file must have a valid name.');
  }
  if (
    normalized_name === '.' ||
    normalized_name === '..' ||
    /[\0\r\n]/.test(normalized_name) ||
    /[\\/]/.test(normalized_name) ||
    /[<>:"|?*]/.test(normalized_name)
  ) {
    throw new BadRequestException('The file name is not valid.');
  }

  const parsed_name = path.parse(normalized_name);
  if (!parsed_name.name || WINDOWS_RESERVED_NAME.test(parsed_name.name)) {
    throw new BadRequestException('The file name is not valid.');
  }

  const extension = parsed_name.ext.toLowerCase();
  const allowed_type = ALLOWED_DOCUMENT_TYPES[extension];
  if (!allowed_type || (policy === 'inspection-image' && !INSPECTION_EXTENSIONS.has(extension))) {
    throw new BadRequestException('The file extension is not allowed.');
  }

  const normalized_mime = mime_type?.split(';', 1)[0].trim().toLowerCase();
  if (!allowed_type.mime_types.includes(normalized_mime)) {
    throw new BadRequestException(
      'The MIME type does not match the file extension.',
    );
  }

  return { extension, mime_type: normalized_mime, original_name: normalized_name };
}

export function validateDocumentMetadata(
  file: Express.Multer.File,
  policy: DocumentPolicy = 'document',
) {
  return getValidatedMetadata(file?.originalname, file?.mimetype, policy);
}

export function validateDocumentFile(
  file: Express.Multer.File,
  policy: DocumentPolicy = 'document',
  requested_name?: string,
): ValidatedDocument {
  if (!file) {
    throw new BadRequestException('A file is required for upload.');
  }
  if (!Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
    throw new BadRequestException('The file cannot be empty.');
  }
  if (file.buffer.length > MAX_DOCUMENT_FILE_SIZE) {
    throw new BadRequestException('The file exceeds the maximum allowed size of 10 MB.');
  }

  const metadata = validateDocumentMetadata(file, policy);
  const allowed_type = ALLOWED_DOCUMENT_TYPES[metadata.extension];
  if (!allowed_type.signature(file.buffer)) {
    throw new BadRequestException(
      'The file content does not match the declared format.',
    );
  }

  const display_name = sanitizeDocumentDisplayName(
    requested_name?.trim() || metadata.original_name,
  );
  return {
    extension: metadata.extension,
    mime_type: metadata.mime_type,
    display_name,
  };
}

export function sanitizeDocumentDisplayName(name: string) {
  const sanitized = name
    ?.trim()
    .replace(/[\0\r\n]/g, '')
    .replace(/[\\/]/g, '_')
    .replace(/[<>:"|?*]/g, '_')
    .slice(0, 255);
  if (!sanitized || sanitized === '.' || sanitized === '..') {
    throw new BadRequestException('The document name is not valid.');
  }
  return sanitized;
}

export function createStoredFileName(extension: string) {
  return `${randomUUID()}${extension}`;
}

export function ensurePathInsideRoot(root: string, candidate: string) {
  const relative_path = path.relative(root, candidate);
  if (
    relative_path === '' ||
    relative_path.startsWith('..') ||
    path.isAbsolute(relative_path)
  ) {
    throw new ForbiddenException('The document path is not valid.');
  }
  return candidate;
}

function createSafeLocation(
  directory_segments: string[],
  url_segments: string[],
  extension: string,
) {
  const uploads_root = path.resolve(process.cwd(), 'uploads');
  fs.mkdirSync(uploads_root, { recursive: true });
  const real_uploads_root = fs.realpathSync(uploads_root);

  const folder_path = ensurePathInsideRoot(
    real_uploads_root,
    path.resolve(real_uploads_root, ...directory_segments),
  );
  fs.mkdirSync(folder_path, { recursive: true });
  const real_folder_path = fs.realpathSync(folder_path);
  ensurePathInsideRoot(real_uploads_root, real_folder_path);

  const stored_name = createStoredFileName(extension);
  const file_path = ensurePathInsideRoot(
    real_uploads_root,
    path.resolve(real_folder_path, stored_name),
  );

  return {
    file_path,
    url: path.posix.join('/uploads', ...url_segments, stored_name),
  };
}

export function createSafeStorageLocation(
  request_id: string,
  folder: string,
  extension: string,
) {
  return createSafeLocation(
    ['expedientes', request_id, folder],
    ['expedientes', request_id, folder],
    extension,
  );
}

export function createSafeInspectionStorageLocation(extension: string) {
  return createSafeLocation(['inspections'], ['inspections'], extension);
}

export function createDocumentFileFilter(policy: DocumentPolicy = 'document') {
  return (
    _request: Express.Request,
    file: Express.Multer.File,
    callback: (error: Error | null, accept_file: boolean) => void,
  ) => {
    try {
      validateDocumentMetadata(file, policy);
      callback(null, true);
    } catch (error) {
      callback(error as Error, false);
    }
  };
}
