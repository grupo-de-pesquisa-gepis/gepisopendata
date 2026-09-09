export interface IbgeMalhaFileStatus {
  format: 'geojson' | 'shapefile';
  quality?: 'minima' | 'intermediaria' | 'maxima';
  fileName: string;
  filePath: string;
  sizeBytes: number;
  exists: boolean;
  isExtracted: boolean;
  updatedAt?: string;
}

export interface IbgeMalhaLevelStatus {
  id: string; // 'pais' | 'regioes' | 'uf' | 'intermediarias' | 'imediatas' | 'microrregioes' | 'municipios'
  name: string;
  description: string;
  packageName: string;
  expectedFeatures: number;
  geojsonFiles: IbgeMalhaFileStatus[];
  shapefile?: IbgeMalhaFileStatus;
}

export interface IbgeMalhasOverview {
  levels: IbgeMalhaLevelStatus[];
  totalSizeBytes: number;
  totalFilesCount: number;
  malhasDir: string;
}

export interface IbgeDownloadRequest {
  level: string;
  format: 'geojson' | 'shapefile';
  quality?: 'minima' | 'intermediaria' | 'maxima';
  enrichNames?: boolean;
  extractZip?: boolean;
}

export interface IbgeDownloadProgress {
  level: string;
  format: 'geojson' | 'shapefile';
  stage: 'downloading' | 'enriching' | 'extracting' | 'completed' | 'error';
  bytesDownloaded: number;
  totalBytes?: number;
  percentage?: number;
  message: string;
}
