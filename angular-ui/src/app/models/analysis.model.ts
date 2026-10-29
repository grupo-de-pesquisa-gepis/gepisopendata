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

export interface ArtifactSeries {
  name: string;
  values: number[];
}

export interface AnalysisArtifact {
  id: string;
  label: string;
  type: 'barchart' | 'linechart' | 'map_choropleth' | 'table' | 'statistics';
  params: Record<string, any>;
  geoLevel?: 'pais' | 'regioes' | 'uf' | 'intermediarias' | 'imediatas' | 'microrregioes' | 'municipios' | string;
  colorScale?: string[];
  data?: {
    x: any[];
    y?: any[];
    series?: ArtifactSeries[];
    locations?: string[];
    values?: number[];
  };
  xTitle?: string;
  yTitle?: string;
  xLabelMap?: Record<string, string>;
  legendLabelMap?: Record<string, string>;
  yPrefix?: string;
  ySuffix?: string;
  valueDisplayMode?: 'none' | 'value' | 'percent' | 'both';
  percentBaseMode?: 'series_sum' | 'custom' | 'category_sum';
  customPercentTotal?: number | null;
  percentDecimals?: number;
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
