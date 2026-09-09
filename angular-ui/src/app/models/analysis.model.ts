export interface BarChartData {
  categories: string[];
  values: number[];
}

export interface VariableSpec {
  name: string;
  type: string;
  description?: string;
  statisticalType?: string;
}

export interface AnalysisArtifact {
  id: string;
  label: string;
  type: 'barchart' | 'table' | 'statistics';
  params: Record<string, any>;
  data?: {
    x: any[];
    y: any[];
  };
  xTitle?: string;
  yTitle?: string;
  xLabelMap?: Record<string, string>;
  yPrefix?: string;
  ySuffix?: string;
  createdAt: string;
}

export interface AnalysisConfig {
  id?: string;
  name: string;
  groupName: string;
  files: string[];
  dictionary?: string | null;
  variables: VariableSpec[];
  publishedArtifacts?: AnalysisArtifact[];
  updatedAt?: string;
}
