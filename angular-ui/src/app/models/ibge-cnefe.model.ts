export interface IbgeCnefeUfStatus {
  code: string;
  sigla: string;
  name: string;
  region: string;
  packageName: string;
  zipFileName: string;
  zipFilePath: string;
  zipSizeBytes: number;
  zipExists: boolean;
  isExtracted: boolean;
  csvFileName?: string;
  csvFilePath?: string;
  csvSizeBytes: number;
  csvExists: boolean;
  updatedAt?: string;
}

export interface IbgeCnefeOverview {
  ufs: IbgeCnefeUfStatus[];
  totalSizeBytes: number;
  totalZipCount: number;
  totalExtractedCount: number;
  cnefeDir: string;
}

export interface IbgeCnefeDownloadRequest {
  uf: string;
  extractZip?: boolean;
  force?: boolean;
}

export interface IbgeCnefeDownloadProgress {
  uf: string;
  stage: 'downloading' | 'extracting' | 'completed' | 'error';
  bytesDownloaded: number;
  totalBytes?: number;
  percentage?: number;
  message: string;
}
