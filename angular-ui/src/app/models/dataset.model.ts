export interface ColumnInfo {
  name: string;
  type: string;
}

export interface GroupAnalysis {
  files: string[];
  common_columns: ColumnInfo[];
  format: string;
}

export interface DatasetMetadata {
  titulo: string;
  tituloCurto: string;
  grupo: string;
  formato: string;
  ano?: string | number;
  descricao?: string;
  fonte?: string;
  isSerieHistorica?: boolean;
  urls?: string;
}

export interface DatasetEntry extends DatasetMetadata {
  id: string;
  localPath?: string;
  exists?: boolean;
  files?: string[];
  dateAdded?: string;
}
