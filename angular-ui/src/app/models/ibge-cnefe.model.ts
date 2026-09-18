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

export interface CnefeSchoolRecord {
  coEntidade: string;
  noEntidade: string;
  sgUf: string;
  coUf: string;
  noMunicipio: string;
  coMunicipio: string;
  coCep: string;
  dsEndereco: string;
  nuEndereco: string;
  noBairro: string;
  tpDependencia: string;
  tpLocalizacao: string;
  // Georreferenciamento
  latitude?: string;
  longitude?: string;
  cnefeNvGeoCoord?: string;
  cnefeDscEstabelecimento?: string;
  statusGeolocalizacao: 'alta' | 'media' | 'baixa' | 'ambiguo' | 'sem_correspondencia' | string;
  confiancaNome?: string;
}

export interface CnefeSchoolSummary {
  totalEscolas: number;
  totalGeorreferenciadas: number;
  percGeorreferenciadas: number;
  altaConfianca: number;
  percAlta: number;
  mediaConfianca: number;
  percMedia: number;
  baixaConfianca: number;
  percBaixa: number;
  ambiguas: number;
  percAmbiguas: number;
  semCorrespondencia: number;
  percSemCorrespondencia: number;
  ufsProcessadas: string[];
  inepCensoDisponivel: boolean;
  inepCensoArquivo?: string;
  cnefeDisponivel: boolean;
  outputFilePath?: string;
}

export interface CnefeSchoolComparisonResult {
  summary: CnefeSchoolSummary;
  records: CnefeSchoolRecord[];
  totalRecords: number;
  page: number;
  pageSize: number;
}

export interface CnefeSchoolQuery {
  uf?: string;
  status?: 'all' | 'georreferenciada' | 'nao_georreferenciada' | 'alta' | 'media' | 'baixa' | 'ambiguo' | 'sem_correspondencia';
  search?: string;
  municipio?: string;
  page?: number;
  pageSize?: number;
}

export interface CnefeInepMatchProgress {
  stage: string;
  uf?: string;
  currentStep: number;
  totalSteps: number;
  percentage?: number;
  message: string;
}
