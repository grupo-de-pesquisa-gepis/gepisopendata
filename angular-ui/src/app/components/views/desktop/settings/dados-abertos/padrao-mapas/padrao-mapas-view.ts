import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  AfterViewInit,
  inject,
  signal,
  computed,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatButtonModule } from '@angular/material/button';
import * as L from 'leaflet';
import { invoke } from '@tauri-apps/api/core';
import { IbgeMalhasApiService } from '../../../../../../services/ibge-malhas-api.service';
import { isTauri } from '../../../../../../services/environment';

interface BasemapProvider {
  key: string;
  name: string;
  url: string;
  options: L.TileLayerOptions;
  description: string;
}

interface LayerDocLink {
  label: string;
  url: string;
  description?: string;
}

interface GeoJsonMeta {
  key: string;
  name: string;
  icon: string;
  fileName: string;
  description: string;
  featuresExpected: number;
  sizeEstimate: string;
  recommendedZoom: string;
  detailedExplanation?: string;
  ibgeConcepts?: string[];
  officialLinks?: LayerDocLink[];
}

interface ActiveLayerEntry {
  leafletLayer: L.GeoJSON;
  featuresCount: number;
  downloadDurationMs: number;
  payloadSizeBytes: number;
  fromCache: boolean;
}

interface SelectedFeatureInfo {
  nome: string;
  codigo: string;
  uf?: string;
  regiao?: string;
  area?: string;
}

const LAYER_ORDER = ['pais', 'regioes', 'uf', 'intermediarias', 'imediatas', 'municipios'];

const GEOJSON_METADATA_MAP: Record<string, GeoJsonMeta> = {
  pais: {
    key: 'pais',
    name: 'Contorno do País (Brasil)',
    icon: '🇧🇷',
    fileName: 'BR_pais_2024_minima.geojson',
    description: 'Contorno Nacional do Brasil',
    featuresExpected: 1,
    sizeEstimate: '15 KB',
    recommendedZoom: 'Z = 0 a 3',
    detailedExplanation:
      'Representa o polígono limítrofe contínuo de toda a extensão territorial da República Federativa do Brasil, incluindo a porção continental e ilhas oceânicas integradas, conforme a Malha Municipal e Territorial 2024 do IBGE.',
    ibgeConcepts: [
      'Delimitação da fronteira internacional e da costa litorânea brasileira.',
      'Base de referência para cálculos de área territorial total do país (8.510.417,771 km²).',
      'Referencial geodésico oficial SIRGAS 2000.',
    ],
    officialLinks: [
      {
        label: 'Portal de Malhas Territoriais do IBGE',
        url: 'https://www.ibge.gov.br/geociencias/organizacao-do-territorio/malhas-territoriais/15774-malhas.html',
        description: 'Página oficial de download e documentação técnica das malhas do IBGE.',
      },
      {
        label: 'API de Malhas Geográficas do IBGE (v4 - Brasil)',
        url: 'https://servicodados.ibge.gov.br/api/v4/malhas/paises/BR',
        description: 'Endpoint REST que fornece a malha vetorial do país em GeoJSON / TopoJSON.',
      },
      {
        label: 'Repositório GeoFTP IBGE - Malha Brasil 2024',
        url: 'https://geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/malhas_municipais/municipio_2024/Brasil/BR/',
        description: 'Diretório FTP oficial com os arquivos vetoriais Shapefile originais.',
      },
    ],
  },
  regioes: {
    key: 'regioes',
    name: 'Grandes Regiões (5)',
    icon: '🎨',
    fileName: 'BR_regioes_2024_minima.geojson',
    description: '5 Grandes Regiões (N, NE, CO, SE, S)',
    featuresExpected: 5,
    sizeEstimate: '33 KB',
    recommendedZoom: 'Z = 4',
    detailedExplanation:
      'Divisão macrorregional oficial do território brasileiro criada pelo IBGE para fins estatísticos e de planejamento. Compreende as 5 Grandes Regiões: Norte (N), Nordeste (NE), Centro-Oeste (CO), Sudeste (SE) e Sul (S).',
    ibgeConcepts: [
      'Agregação de Unidades da Federação contíguas segundo critérios de semelhanças físicas, humanas, econômicas e sociais.',
      'Códigos oficiais IBGE de 1 dígito: 1 (Norte), 2 (Nordeste), 3 (Sudeste), 4 (Sul), 5 (Centro-Oeste).',
    ],
    officialLinks: [
      {
        label: 'Divisão Regional do Brasil - IBGE Geociências',
        url: 'https://www.ibge.gov.br/geociencias/organizacao-do-territorio/divisao-regional/15778-divisoes-regionais-do-brasil.html',
        description: 'Histórico, notas metodológicas e evolução das divisões regionais brasileiras.',
      },
      {
        label: 'API de Localidades do IBGE - Regiões',
        url: 'https://servicodados.ibge.gov.br/api/v1/localidades/regioes',
        description: 'Endpoint com a lista estruturada das 5 macrorregiões brasileiras.',
      },
      {
        label: 'API de Malhas Geográficas do IBGE (v4 - Regiões)',
        url: 'https://servicodados.ibge.gov.br/api/v4/malhas/paises/BR?intrarregiao=regiao',
        description: 'Endpoint REST com os polígonos das 5 grandes regiões em formato GeoJSON.',
      },
    ],
  },
  uf: {
    key: 'uf',
    name: 'Unidades da Federação (27)',
    icon: '🗺️',
    fileName: 'BR_uf_2024_minima.geojson',
    description: '27 Unidades da Federação (Estados e DF)',
    featuresExpected: 27,
    sizeEstimate: '117 KB',
    recommendedZoom: 'Z = 5 a 7',
    detailedExplanation:
      'Compreende os 26 Estados federados e o Distrito Federal. Constituem as subdivisões político-administrativas autônomas primárias da Federação brasileira.',
    ibgeConcepts: [
      'Identificados por código IBGE de 2 dígitos (ex: 11 Rondônia ... 35 São Paulo ... 53 DF).',
      'O primeiro dígito do código estadual identifica a Grande Região à qual o Estado pertence.',
      'Malha atualizada com os limites estaduais vigentes consolidados em 2024.',
    ],
    officialLinks: [
      {
        label: 'Estrutura Político-Administrativa dos Estados - IBGE',
        url: 'https://www.ibge.gov.br/geociencias/organizacao-do-territorio/estrutura-territorial/15761-areas-dos-municipios.html',
        description: 'Tabelas oficiais de áreas e limites das Unidades da Federação.',
      },
      {
        label: 'API de Localidades do IBGE - Estados (UFs)',
        url: 'https://servicodados.ibge.gov.br/api/v1/localidades/estados',
        description: 'Consulta oficial com siglas, nomes e regiões de todos os 27 estados e DF.',
      },
      {
        label: 'API de Malhas Geográficas do IBGE (v4 - Estados)',
        url: 'https://servicodados.ibge.gov.br/api/v4/malhas/paises/BR?intrarregiao=UF',
        description: 'Endpoint vetorial com os polígonos de todas as 27 UFs.',
      },
    ],
  },
  intermediarias: {
    key: 'intermediarias',
    name: 'Regiões Intermediárias (133)',
    icon: '📍',
    fileName: 'BR_intermediarias_2024_minima.geojson',
    description: '133 Regiões Geográficas Intermediárias',
    featuresExpected: 133,
    sizeEstimate: '787 KB',
    recommendedZoom: 'Z = 6 a 8',
    detailedExplanation:
      'As 133 Regiões Geográficas Intermediárias correspondem a uma escala intermediária entre as UFs e as Regiões Imediatas, articuladas em torno de polos urbanos de maior porte e de influência regional e estadual.',
    ibgeConcepts: [
      'Instituídas na revisão da Divisão Regional do Brasil de 2017 pelo IBGE.',
      'Articulam municípios em torno de cidades polo para oferta de serviços de alta complexidade e gestão pública regional.',
      'Identificadas por código numérico de 4 dígitos (2 da UF + 2 de ordem).',
    ],
    officialLinks: [
      {
        label: 'Divisão Regional do Brasil em Regiões Geográficas 2017 (IBGE)',
        url: 'https://www.ibge.gov.br/geociencias/organizacao-do-territorio/divisao-regional/23701-divisao-regional-do-brasil-em-regioes-geograficas-imediatas-e-regioes-geograficas-intermediarias.html',
        description: 'Publicação oficial com a metodologia das Regiões Intermediárias e Imediatas.',
      },
      {
        label: 'API de Localidades do IBGE - Regiões Intermediárias',
        url: 'https://servicodados.ibge.gov.br/api/v1/localidades/regioes-intermediarias',
        description: 'Lista completa das 133 Regiões Intermediárias do Brasil.',
      },
      {
        label: 'API de Malhas Geográficas do IBGE (v4 - Intermediárias)',
        url: 'https://servicodados.ibge.gov.br/api/v4/malhas/paises/BR?intrarregiao=regiao-intermediaria',
        description: 'Polígonos vetoriais das 133 Regiões Geográficas Intermediárias.',
      },
    ],
  },
  imediatas: {
    key: 'imediatas',
    name: 'Regiões Imediatas (510)',
    icon: '🏘️',
    fileName: 'BR_imediatas_2024_minima.geojson',
    description: '510 Regiões Geográficas Imediatas',
    featuresExpected: 510,
    sizeEstimate: '1.4 MB',
    recommendedZoom: 'Z = 7 a 9',
    detailedExplanation:
      'As 510 Regiões Geográficas Imediatas têm como base a rede de relações dos municípios com um centro urbano principal para atendimento de necessidades imediatas (comércio, emprego, serviços de saúde e educação básica/secundária).',
    ibgeConcepts: [
      'Substituíram o antigo conceito de Micro-regiões a partir de 2017.',
      'Estruturam o fluxo diário de deslocamento da população em busca de serviços essenciais.',
      'Identificadas por código numérico de 6 dígitos.',
    ],
    officialLinks: [
      {
        label: 'Quadro Metodológico das Regiões Imediatas - IBGE',
        url: 'https://www.ibge.gov.br/geociencias/organizacao-do-territorio/divisao-regional/23701-divisao-regional-do-brasil-em-regioes-geograficas-imediatas-e-regioes-geograficas-intermediarias.html',
        description: 'Documento técnico e mapas de articulação regional.',
      },
      {
        label: 'API de Localidades do IBGE - Regiões Imediatas',
        url: 'https://servicodados.ibge.gov.br/api/v1/localidades/regioes-imediatas',
        description: 'Lista completa e mapeamento das 510 Regiões Imediatas.',
      },
      {
        label: 'API de Malhas Geográficas do IBGE (v4 - Imediatas)',
        url: 'https://servicodados.ibge.gov.br/api/v4/malhas/paises/BR?intrarregiao=regiao-imediata',
        description: 'Polígonos vetoriais das 510 Regiões Geográficas Imediatas.',
      },
    ],
  },
  municipios: {
    key: 'municipios',
    name: 'Municípios do Brasil (5.571)',
    icon: '🏙️',
    fileName: 'BR_municipios_2024_minima.geojson',
    description: '5.571 Municípios Brasileiros',
    featuresExpected: 5571,
    sizeEstimate: '5.3 MB',
    recommendedZoom: 'Z = 8 a 18',
    detailedExplanation:
      'A Malha Municipal do IBGE reúne a totalidade dos 5.568 municípios brasileiros, além do Distrito Federal e do Distrito Estadual de Fernando de Noronha (PE), totalizando 5.570/5.571 unidades territoriais com base no Censo e atualizações de 2024.',
    ibgeConcepts: [
      'Menor unidade político-administrativa autônoma no Brasil dotada de governo próprio.',
      'Cada município possui um código IBGE único de 7 dígitos (ex: 3550308 para São Paulo/SP).',
      'Polígonos detalhados e simplificados com tolerância topológica de contiguidade.',
    ],
    officialLinks: [
      {
        label: 'Malha Municipal 2024 - Geociências IBGE',
        url: 'https://www.ibge.gov.br/geociencias/organizacao-do-territorio/malhas-territoriais/15774-malhas.html',
        description: 'Downloads em SHP, KML e documentação da Malha Municipal 2024.',
      },
      {
        label: 'API de Localidades do IBGE - Municípios',
        url: 'https://servicodados.ibge.gov.br/api/v1/localidades/municipios',
        description: 'Dados cadastrais, microrregião, mesorregião e estado de todos os municípios.',
      },
      {
        label: 'API de Malhas Geográficas do IBGE (v4 - Municípios)',
        url: 'https://servicodados.ibge.gov.br/api/v4/malhas/paises/BR?intrarregiao=municipio',
        description: 'Endpoint REST com a geometria GeoJSON dos municípios do país.',
      },
    ],
  },
};

const BASEMAP_PROVIDERS_MAP: Record<string, BasemapProvider> = {
  'carto-light': {
    key: 'carto-light',
    name: 'CartoDB Positron (Claro)',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    options: {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a> | Dados: <a href="https://www.ibge.gov.br">IBGE 2024</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    },
    description:
      '<strong>CartoDB Positron:</strong> Fundo claro e minimalista, ideal para destacar mapas temáticos e polígonos sem poluição visual.',
  },
  'carto-dark': {
    key: 'carto-dark',
    name: 'CartoDB Dark Matter (Escuro)',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    options: {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a> | Dados: <a href="https://www.ibge.gov.br">IBGE 2024</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    },
    description:
      '<strong>CartoDB Dark Matter:</strong> Modo escuro de alto contraste, ideal para visualizações noturnas ou polígonos fluorescentes.',
  },
  osm: {
    key: 'osm',
    name: 'OpenStreetMap (Padrão)',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    options: {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | Dados: <a href="https://www.ibge.gov.br">IBGE 2024</a>',
      maxZoom: 19,
    },
    description:
      '<strong>OpenStreetMap Padrão:</strong> Mapa rico em detalhes urbanos, vias, rios e relevo clássico.',
  },
  'esri-satellite': {
    key: 'esri-satellite',
    name: 'Esri World Imagery (Satélite)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    options: {
      attribution:
        'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and GIS User Community | Dados: <a href="https://www.ibge.gov.br">IBGE 2024</a>',
      maxZoom: 18,
    },
    description:
      '<strong>Esri Satélite:</strong> Fotografias reais de satélite em alta resolução para relevo e cobertura do solo.',
  },
  opentopo: {
    key: 'opentopo',
    name: 'OpenTopoMap (Topográfico)',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    options: {
      attribution:
        'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> | Dados: <a href="https://www.ibge.gov.br">IBGE 2024</a>',
      maxZoom: 17,
    },
    description:
      '<strong>OpenTopoMap:</strong> Mapa topográfico com relevo sombreado e curvas de nível de elevação.',
  },
};

const REGION_COLORS: Record<string, string> = {
  '1': '#2b83ba',
  Norte: '#2b83ba',
  N: '#2b83ba',
  '2': '#abdda4',
  Nordeste: '#abdda4',
  NE: '#abdda4',
  '5': '#ffffbf',
  'Centro-Oeste': '#ffffbf',
  CO: '#ffffbf',
  '3': '#fdae61',
  Sudeste: '#fdae61',
  SE: '#fdae61',
  '4': '#d7191c',
  Sul: '#d7191c',
  S: '#d7191c',
};

const PAIS_COLOR = '#64748b';
const MUNICIPIO_PALETTE = [
  '#f97316', '#a855f7', '#14b8a6', '#eab308',
  '#ec4899', '#22c55e', '#0ea5e9', '#f43f5e',
  '#84cc16', '#8b5cf6', '#06b6d4', '#d946ef',
];
const UF_LIGHTNESS_STEPS = [0, -16, 14, -28, 26, -8, 8, 20, -20];
const UF_BORDER_COLOR = '#1e293b';
const UF_BORDER_WEIGHT = 2.2;

function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return Math.abs(hash);
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h /= 6;
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x: number) => Math.round(255 * x).toString(16).padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

@Component({
  selector: 'app-padrao-mapas-view',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatTooltipModule, MatButtonModule],
  templateUrl: './padrao-mapas-view.html',
  styleUrl: './padrao-mapas-view.css',
})
export class PadraoMapasView implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('mapContainer', { static: false }) mapContainerRef!: ElementRef<HTMLDivElement>;

  private malhasService = inject(IbgeMalhasApiService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  basemapList = Object.values(BASEMAP_PROVIDERS_MAP);
  availableLayers = Object.values(GEOJSON_METADATA_MAP);

  selectedBasemap = signal<string>('carto-light');
  showDebugGrid = signal<boolean>(true);
  autoLodEnabled = signal<boolean>(true);
  isLoading = signal<boolean>(false);
  loadingMessage = signal<string>('Carregando malha...');
  missingMalhaMessage = signal<string | null>(null);

  currentZoom = signal<number>(4);
  gridDimension = signal<string>('16 × 16');
  totalTiles = signal<string>('256 tiles');
  centerTileText = signal<string>('Z: 4 | X: 6 | Y: 9');
  visibleTilesText = signal<string>('Calculando...');

  currentBasemapDesc = signal<string>(BASEMAP_PROVIDERS_MAP['carto-light'].description);
  currentBasemapUrl = signal<string>(BASEMAP_PROVIDERS_MAP['carto-light'].url);
  currentSampleTileUrl = signal<string>('https://a.basemaps.cartocdn.com/light_all/4/6/9.png');

  selectedFeature = signal<SelectedFeatureInfo | null>(null);
  activeLayerKeys = signal<string[]>([]);
  selectedLayerInfoForModal = signal<GeoJsonMeta | null>(null);

  checkedLayersState = signal<Record<string, boolean>>({
    pais: false,
    regioes: true,
    uf: false,
    intermediarias: false,
    imediatas: false,
    municipios: false,
  });

  zoomPresets = [
    { label: 'Mundo', zoom: 0 },
    { label: 'América', zoom: 3 },
    { label: 'Brasil', zoom: 4 },
    { label: 'Estado', zoom: 7 },
    { label: 'Cidade', zoom: 11 },
    { label: 'Rua', zoom: 15 },
  ];

  private map?: L.Map;
  private currentBasemapLayer?: L.TileLayer;
  private debugGridLayer?: L.GridLayer;
  private ufBoundaryLayer?: L.GeoJSON;

  activeLayersMap: Record<string, ActiveLayerEntry> = {};
  private geoJsonCache: Record<string, { data: any; size: number }> = {};
  private autoLodCurrentKey: string | null = null;

  ngOnInit(): void {}

  ngAfterViewInit(): void {
    this.initMap();
  }

  ngOnDestroy(): void {
    if (this.map) {
      this.map.remove();
    }
  }

  private initMap(): void {
    if (!this.mapContainerRef) return;

    this.map = L.map(this.mapContainerRef.nativeElement, {
      center: [-14.235, -51.925],
      zoom: 4,
      minZoom: 0,
      maxZoom: 18,
      zoomSnap: 1,
      zoomDelta: 1,
    });

    this.setBasemap(this.selectedBasemap());
    this.initDebugGrid();

    this.map.on('zoomend moveend', () => {
      this.updateTilePyramidStats();
    });

    this.map.on('zoomend', () => {
      this.handleAutoLodByZoom();
    });

    this.handleAutoLodByZoom();
    this.updateTilePyramidStats();
  }

  private initDebugGrid(): void {
    if (!this.map) return;

    const DebugGridClass = L.GridLayer.extend({
      createTile: (coords: L.Coords) => {
        const tile = document.createElement('div');
        tile.className = 'debug-tile-grid';
        tile.innerHTML = `
          <div class="tile-coords-tag">
            <span class="z-tag">Z: ${coords.z}</span><br>
            <span class="xy-tag">X: ${coords.x}</span><br>
            <span class="xy-tag">Y: ${coords.y}</span>
          </div>
        `;
        return tile;
      },
    });

    this.debugGridLayer = new (DebugGridClass as any)({
      zIndex: 500,
    });

    if (this.showDebugGrid() && this.debugGridLayer) {
      this.debugGridLayer.addTo(this.map);
    }
  }

  setBasemap(providerKey: string): void {
    if (!this.map) return;
    const provider = BASEMAP_PROVIDERS_MAP[providerKey];
    if (!provider) return;

    if (this.currentBasemapLayer) {
      this.map.removeLayer(this.currentBasemapLayer);
    }

    this.currentBasemapLayer = L.tileLayer(provider.url, provider.options);
    this.currentBasemapLayer.addTo(this.map);
    this.currentBasemapLayer.bringToBack();

    this.selectedBasemap.set(providerKey);
    this.currentBasemapDesc.set(provider.description);
    this.currentBasemapUrl.set(provider.url);

    this.updateTilePyramidStats();
  }

  onBasemapChange(event: Event): void {
    const val = (event.target as HTMLSelectElement).value;
    this.setBasemap(val);
  }

  toggleDebugGrid(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.showDebugGrid.set(checked);
    if (!this.map || !this.debugGridLayer) return;

    if (checked) {
      this.debugGridLayer.addTo(this.map);
    } else {
      this.map.removeLayer(this.debugGridLayer);
    }
  }

  onAutoLodToggle(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.autoLodEnabled.set(checked);
    if (checked) {
      this.autoLodCurrentKey = null;
      this.handleAutoLodByZoom();
    }
  }

  onZoomSliderInput(event: Event): void {
    const targetZoom = Number((event.target as HTMLInputElement).value);
    if (this.map) {
      this.map.setZoom(targetZoom);
    }
  }

  setZoomPreset(zoom: number): void {
    if (this.map) {
      this.map.setZoom(zoom);
    }
  }

  isLayerChecked(layerKey: string): boolean {
    return !!this.checkedLayersState()[layerKey];
  }

  onLayerCheckboxChange(layerKey: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.autoLodEnabled.set(false);
    this.autoLodCurrentKey = null;

    this.checkedLayersState.update((state) => ({
      ...state,
      [layerKey]: checked,
    }));

    if (checked) {
      this.addLayerToMap(layerKey);
    } else {
      this.removeLayerFromMap(layerKey);
    }
  }

  getLayerMeta(key: string): GeoJsonMeta {
    return GEOJSON_METADATA_MAP[key] || {
      key,
      name: key,
      icon: '📁',
      fileName: `${key}.geojson`,
      description: key,
      featuresExpected: 0,
      sizeEstimate: '-',
      recommendedZoom: '-',
    };
  }

  private handleAutoLodByZoom(): void {
    if (!this.autoLodEnabled() || !this.map) return;

    const zoom = Math.round(this.map.getZoom());
    let targetLayerKey = 'pais';

    if (zoom <= 3) {
      targetLayerKey = 'pais';
    } else if (zoom === 4) {
      targetLayerKey = 'regioes';
    } else if (zoom >= 5 && zoom <= 7) {
      targetLayerKey = 'uf';
    } else if (zoom >= 8) {
      targetLayerKey = 'municipios';
    }

    if (targetLayerKey !== this.autoLodCurrentKey) {
      this.autoLodCurrentKey = targetLayerKey;
      this.setExclusiveLayer(targetLayerKey);
    }
  }

  private setExclusiveLayer(targetKey: string): void {
    const newState: Record<string, boolean> = {};
    LAYER_ORDER.forEach((key) => {
      const shouldBeOn = key === targetKey;
      newState[key] = shouldBeOn;
      if (shouldBeOn && !this.activeLayersMap[key]) {
        this.addLayerToMap(key);
      } else if (!shouldBeOn && this.activeLayersMap[key]) {
        this.removeLayerFromMap(key);
      }
    });
    this.checkedLayersState.set(newState);
  }

  goToGerenciarMalhas(): void {
    this.router.navigate(['/desktop/settings/dados-abertos/malhas-ibge']);
  }

  private async addLayerToMap(layerKey: string, shouldFitBounds = false): Promise<void> {
    const meta = GEOJSON_METADATA_MAP[layerKey];
    if (!meta || this.activeLayersMap[layerKey] || !this.map) return;

    this.isLoading.set(true);
    this.loadingMessage.set(`Carregando ${meta.name}...`);
    const startTime = performance.now();

    try {
      let geojsonData: any;
      let payloadSizeBytes = 0;
      let fromCache = false;

      if (this.geoJsonCache[layerKey]) {
        geojsonData = this.geoJsonCache[layerKey].data;
        payloadSizeBytes = this.geoJsonCache[layerKey].size;
        fromCache = true;
      } else {
        const res = await this.malhasService.getGeoJsonData(layerKey, 'minima');
        geojsonData = res.data;
        payloadSizeBytes = res.sizeBytes;
        this.geoJsonCache[layerKey] = {
          data: geojsonData,
          size: payloadSizeBytes,
        };
      }

      const downloadDurationMs = performance.now() - startTime;

      const leafletLayer = L.geoJSON(geojsonData, {
        style: (feature) => this.getFeatureStyle(feature, layerKey),
        onEachFeature: (feature, layer) => this.bindFeatureEvents(feature, layer, layerKey),
      });

      this.activeLayersMap[layerKey] = {
        leafletLayer,
        featuresCount: geojsonData.features ? geojsonData.features.length : meta.featuresExpected,
        downloadDurationMs,
        payloadSizeBytes,
        fromCache,
      };

      this.reorderActiveLayers();

      if (shouldFitBounds && leafletLayer.getBounds().isValid()) {
        this.map.fitBounds(leafletLayer.getBounds(), { padding: [10, 10] });
      }

      this.missingMalhaMessage.set(null);
      this.updateActiveLayerKeys();
      this.updateTilePyramidStats();
    } catch (err: any) {
      console.warn(`Malha ${layerKey} não disponível:`, err);
      this.missingMalhaMessage.set(
        `A malha "${meta.name}" não foi encontrada localmente. Baixe o pacote correspondente em "Gerenciar Malhas".`
      );
      this.checkedLayersState.update((state) => ({ ...state, [layerKey]: false }));
    } finally {
      this.isLoading.set(false);
      this.cdr.markForCheck();
    }
  }

  private removeLayerFromMap(layerKey: string): void {
    const entry = this.activeLayersMap[layerKey];
    if (!entry || !this.map) return;

    this.map.removeLayer(entry.leafletLayer);
    delete this.activeLayersMap[layerKey];

    this.syncUfBoundaryOverlay();
    this.updateActiveLayerKeys();
    this.cdr.markForCheck();
  }

  private updateActiveLayerKeys(): void {
    this.activeLayerKeys.set(LAYER_ORDER.filter((k) => !!this.activeLayersMap[k]));
  }

  private reorderActiveLayers(): void {
    if (!this.map) return;
    LAYER_ORDER.forEach((key) => {
      const entry = this.activeLayersMap[key];
      if (!entry) return;
      if (!this.map!.hasLayer(entry.leafletLayer)) {
        entry.leafletLayer.addTo(this.map!);
      }
      entry.leafletLayer.bringToFront();
    });
    this.syncUfBoundaryOverlay();
  }

  private syncUfBoundaryOverlay(): void {
    if (!this.map) return;
    const shouldShow = Boolean(this.activeLayersMap['uf']) && Boolean(this.geoJsonCache['uf']);

    if (!shouldShow) {
      if (this.ufBoundaryLayer && this.map.hasLayer(this.ufBoundaryLayer)) {
        this.map.removeLayer(this.ufBoundaryLayer);
      }
      return;
    }

    if (!this.ufBoundaryLayer) {
      this.ufBoundaryLayer = L.geoJSON(this.geoJsonCache['uf'].data, {
        interactive: false,
        style: () => ({
          fillOpacity: 0,
          weight: UF_BORDER_WEIGHT,
          color: UF_BORDER_COLOR,
          opacity: 0.9,
        }),
      });
    }

    if (!this.map.hasLayer(this.ufBoundaryLayer)) {
      this.ufBoundaryLayer.addTo(this.map);
    }
    this.ufBoundaryLayer.bringToFront();
  }

  private getFeatureStyle(feature: any, layerKey: string): L.PathOptions {
    const isUf = layerKey === 'uf';
    return {
      fillColor: this.getFeatureColor(feature?.properties, layerKey),
      weight: isUf ? UF_BORDER_WEIGHT : 1.2,
      opacity: 1,
      color: isUf ? UF_BORDER_COLOR : '#ffffff',
      dashArray: '',
      fillOpacity: 0.7,
    };
  }

  private getFeatureColor(properties: any, layerKey: string): string {
    if (!properties) return '#3b82f6';
    switch (layerKey) {
      case 'pais':
        return PAIS_COLOR;
      case 'uf':
        return this.getUfColor(properties);
      case 'municipios':
      case 'imediatas':
      case 'intermediarias':
        return this.getMunicipioColor(properties);
      case 'regioes':
      default:
        return this.getRegionBaseColor(properties);
    }
  }

  private getRegionBaseColor(props: any): string {
    const regId = props.cd_regiao || props.sigla_regiao || props.sigla || props.nome;
    return REGION_COLORS[regId] || '#60a5fa';
  }

  private getUfColor(props: any): string {
    const baseColor = this.getRegionBaseColor(props);
    const hsl = hexToHsl(baseColor);
    const ufKey = props.sigla || props.codarea || props.nome || '';
    const stepIndex = hashString(String(ufKey)) % UF_LIGHTNESS_STEPS.length;
    const lightness = Math.min(80, Math.max(22, hsl.l + UF_LIGHTNESS_STEPS[stepIndex]));
    return hslToHex(hsl.h, hsl.s, lightness);
  }

  private getMunicipioColor(props: any): string {
    const key = props.codarea || props.nome || '';
    const index = hashString(String(key)) % MUNICIPIO_PALETTE.length;
    return MUNICIPIO_PALETTE[index];
  }

  private bindFeatureEvents(feature: any, layer: L.Layer, layerKey: string): void {
    const props = feature.properties || {};
    const label = props.nome || props.nm_mun || props.nm_uf || props.codarea || 'Brasil';

    layer.bindTooltip(label, {
      permanent: false,
      direction: 'auto',
      className: 'leaflet-tooltip-custom',
    });

    const highlightStyle: L.PathOptions = {
      weight: 3,
      color: '#1e3a8a',
      fillOpacity: 0.85,
    };

    layer.on({
      mouseover: (e: L.LeafletMouseEvent) => {
        const target = e.target;
        target.setStyle(highlightStyle);
        target.bringToFront();
        this.updateDetails(props);
      },
      mouseout: (e: L.LeafletMouseEvent) => {
        (layer as L.Path).setStyle(this.getFeatureStyle(feature, layerKey));
      },
      click: (e: L.LeafletMouseEvent) => {
        if (this.map && typeof (layer as any).getBounds === 'function') {
          this.map.fitBounds((layer as any).getBounds(), { padding: [20, 20] });
        }
        this.updateDetails(props);
      },
    });
  }

  private updateDetails(props: any): void {
    if (!props) {
      this.selectedFeature.set(null);
      return;
    }
    const nome = props.nome || props.nm_mun || props.nm_uf || 'Brasil';
    const codigo = props.codarea || props.cd_mun || props.cd_uf || '-';
    const uf = props.sigla_uf || props.sigla || undefined;
    const regiao = props.nm_regiao || props.nome || undefined;
    const area = props.AREA_KM2 ? `${Number(props.AREA_KM2).toLocaleString('pt-BR')} km²` : undefined;

    this.selectedFeature.set({ nome, codigo, uf, regiao, area });
    this.cdr.markForCheck();
  }

  private latLngToTileCoords(lat: number, lng: number, zoom: number): { x: number; y: number } {
    const n = Math.pow(2, zoom);
    const x = Math.floor(((lng + 180) / 360) * n);
    const latRad = (lat * Math.PI) / 180;
    const y = Math.floor(
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
    );
    return {
      x: Math.max(0, Math.min(n - 1, x)),
      y: Math.max(0, Math.min(n - 1, y)),
    };
  }

  private getVisibleTilesRange(zoom: number) {
    if (!this.map) return { minX: 0, maxX: 0, minY: 0, maxY: 0, total: 0 };
    const bounds = this.map.getBounds();
    const nw = bounds.getNorthWest();
    const se = bounds.getSouthEast();

    const nwTile = this.latLngToTileCoords(nw.lat, nw.lng, zoom);
    const seTile = this.latLngToTileCoords(se.lat, se.lng, zoom);

    const minX = Math.min(nwTile.x, seTile.x);
    const maxX = Math.max(nwTile.x, seTile.x);
    const minY = Math.min(nwTile.y, seTile.y);
    const maxY = Math.max(nwTile.y, seTile.y);

    const countX = maxX - minX + 1;
    const countY = maxY - minY + 1;
    const total = countX * countY;

    return { minX, maxX, minY, maxY, countX, countY, total };
  }

  private updateTilePyramidStats(): void {
    if (!this.map) return;
    const zoom = Math.round(this.map.getZoom());
    const center = this.map.getCenter();
    const tileCoords = this.latLngToTileCoords(center.lat, center.lng, zoom);
    const dimension = Math.pow(2, zoom);
    const totalTilesCount = Math.pow(4, zoom);
    const visible = this.getVisibleTilesRange(zoom);

    this.currentZoom.set(zoom);
    this.gridDimension.set(`${dimension.toLocaleString('pt-BR')} × ${dimension.toLocaleString('pt-BR')}`);
    this.totalTiles.set(`${totalTilesCount.toLocaleString('pt-BR')} tiles`);
    this.centerTileText.set(`Z: ${zoom} | X: ${tileCoords.x} | Y: ${tileCoords.y}`);
    this.visibleTilesText.set(
      `X: ${visible.minX}..${visible.maxX}, Y: ${visible.minY}..${visible.maxY} (${visible.total} tiles)`
    );

    const provider = BASEMAP_PROVIDERS_MAP[this.selectedBasemap()];
    if (provider) {
      const sample = provider.url
        .replace('{s}', 'a')
        .replace('{z}', String(zoom))
        .replace('{x}', String(tileCoords.x))
        .replace('{y}', String(tileCoords.y))
        .replace('{r}', '');
      this.currentSampleTileUrl.set(sample);
    }

    this.cdr.markForCheck();
  }

  openLayerInfoModal(layer: GeoJsonMeta, event?: MouseEvent): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    this.selectedLayerInfoForModal.set(layer);
  }

  closeLayerInfoModal(): void {
    this.selectedLayerInfoForModal.set(null);
  }

  async openExternalUrl(url: string, event?: MouseEvent): Promise<void> {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (isTauri()) {
      try {
        await invoke('plugin:shell|open', { path: url });
      } catch (err) {
        console.warn('Falha ao abrir URL via Tauri shell, fallback para window.open:', err);
        window.open(url, '_blank');
      }
    } else {
      window.open(url, '_blank');
    }
  }
}
