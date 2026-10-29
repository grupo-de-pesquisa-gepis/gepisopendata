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
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import * as L from 'leaflet';
import { IbgeMalhasApiService } from '../../../../../services/ibge-malhas-api.service';
import { DatasetStateService } from '../../../../../services/dataset-state.service';
import { AnalysisApiService } from '../../../../../services/analysis-api.service';
import { DatasetApiService } from '../../../../../services/dataset-api.service';
import { AnalysisArtifact, AnalysisConfig } from '../../../../../models';

interface LevelOption {
  id: string;
  name: string;
}

export const CHOROPLETH_COLOR_SCALES: Record<string, { label: string; colors: string[] }> = {
  Blues: {
    label: 'Azul (Padrão)',
    colors: ['#eff3ff', '#bdd7e7', '#6baed6', '#3182bd', '#08519c'],
  },
  Greens: {
    label: 'Verde',
    colors: ['#edf8e9', '#bae4b3', '#74c476', '#31a354', '#006d2c'],
  },
  Oranges: {
    label: 'Laranja',
    colors: ['#feedde', '#fdbe85', '#fd8d3c', '#e6550d', '#a63603'],
  },
  Purples: {
    label: 'Roxo',
    colors: ['#f2f0f7', '#cbc9e2', '#9e9ac8', '#756bb1', '#54278f'],
  },
  Viridis: {
    label: 'Viridis',
    colors: ['#fde725', '#5ec962', '#21918c', '#3b528b', '#440154'],
  },
};

@Component({
  selector: 'app-thematic-map-view',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatSelectModule,
    MatFormFieldModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatTooltipModule,
  ],
  templateUrl: './thematic-map-view.html',
  styleUrl: './thematic-map-view.css',
})
export class ThematicMapView implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('mapContainer', { static: false }) mapContainer!: ElementRef<HTMLDivElement>;

  private malhasApi = inject(IbgeMalhasApiService);
  stateService = inject(DatasetStateService);
  private analysisApi = inject(AnalysisApiService);
  private datasetApi = inject(DatasetApiService);
  private snackBar = inject(MatSnackBar);
  private router = inject(Router);

  private map: L.Map | null = null;
  private geojsonLayer: L.GeoJSON | null = null;
  private currentGeoJson: any = null;

  config = this.stateService.currentAnalysis;

  isLoading = signal<boolean>(false);
  selectedLevel = signal<string>('uf');
  selectedGeoVar = signal<string>('__area__');
  selectedValueVar = signal<string>('');
  selectedMetric = signal<string>('count');
  selectedColorScaleName = signal<string>('Blues');

  featuresCount = signal<number>(0);
  minVal = signal<number>(0);
  maxVal = signal<number>(0);
  totalVal = signal<number>(0);

  // Persisted locations & values from the latest render for publishing
  lastLocations = signal<string[]>([]);
  lastValues = signal<number[]>([]);

  availableLevels: LevelOption[] = [
    { id: 'regioes', name: 'Grandes Regiões (5)' },
    { id: 'uf', name: 'Unidades da Federação (27)' },
    { id: 'intermediarias', name: 'Regiões Intermediárias (133)' },
    { id: 'imediatas', name: 'Regiões Imediatas (510)' },
    { id: 'municipios', name: 'Municípios (5.571)' },
  ];

  colorScaleKeys = Object.keys(CHOROPLETH_COLOR_SCALES);
  colorScales = CHOROPLETH_COLOR_SCALES;

  colorScale = computed(
    () =>
      CHOROPLETH_COLOR_SCALES[this.selectedColorScaleName()]?.colors ||
      CHOROPLETH_COLOR_SCALES['Blues'].colors
  );

  analysisVariables = computed(() => this.config()?.variables || []);

  activeMetricBadgeLabel = computed(() => {
    if (this.selectedGeoVar() === '__area__') {
      return 'Métrica: % Proporção Territorial';
    }
    const met =
      this.selectedMetric() === 'sum'
        ? 'Soma'
        : this.selectedMetric() === 'avg'
          ? 'Média'
          : 'Frequência';
    const valVar = this.selectedValueVar() || this.selectedGeoVar();
    return `${met} (${valVar})`;
  });

  ngOnInit(): void {}

  ngAfterViewInit(): void {
    this.initMap();
    this.loadLevelData();
  }

  ngOnDestroy(): void {
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }

  private initMap(): void {
    if (!this.mapContainer?.nativeElement) return;

    this.map = L.map(this.mapContainer.nativeElement, {
      center: [-14.235, -51.9253], // Centro geográfico aproximado do Brasil
      zoom: 4,
      minZoom: 3,
      maxZoom: 12,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(this.map);
  }

  onAnalysisChange(analysisId: string): void {
    const found = this.stateService.allAnalyses().find((a) => a.id === analysisId);
    if (found) {
      this.stateService.setCurrentAnalysis(found);
      this.selectedGeoVar.set('__area__');
      this.selectedValueVar.set('');
      this.loadLevelData();
    }
  }

  async onLevelChange(levelId: string): Promise<void> {
    this.selectedLevel.set(levelId);
    this.currentGeoJson = null;
    await this.loadLevelData();
  }

  async onGeoVarChange(varName: string): Promise<void> {
    this.selectedGeoVar.set(varName);
    await this.loadLevelData();
  }

  async onValueVarChange(varName: string): Promise<void> {
    this.selectedValueVar.set(varName);
    await this.loadLevelData();
  }

  async onMetricChange(metric: string): Promise<void> {
    this.selectedMetric.set(metric);
    await this.loadLevelData();
  }

  async onColorScaleChange(scaleName: string): Promise<void> {
    this.selectedColorScaleName.set(scaleName);
    await this.loadLevelData(false);
  }

  recenterMap(): void {
    if (this.geojsonLayer && this.map && this.geojsonLayer.getBounds().isValid()) {
      this.map.fitBounds(this.geojsonLayer.getBounds(), { padding: [20, 20] });
    } else if (this.map) {
      this.map.setView([-14.235, -51.9253], 4);
    }
  }

  goBack(): void {
    this.router.navigate(['/desktop/analysis/descritiva']);
  }

  private normalizeKey(val: unknown): string {
    return String(val ?? '')
      .trim()
      .toUpperCase()
      .replace(/\.0+$/, '');
  }

  private normalizeNoAccent(val: unknown): string {
    return this.normalizeKey(val)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  private getFeatureCanonicalKey(feature: any): string {
    const props = feature?.properties || {};
    return String(
      props.sigla || props.SIGLA_UF || props.codarea || props.CD_UF || props.nome || props.NM_UF || ''
    ).trim();
  }

  private matchFeatureInLookup(feature: any, lookup: Map<string, number>): number {
    const props = feature?.properties || {};
    const candidates = [
      props.codarea,
      props.sigla,
      props.nome,
      props.CD_UF,
      props.SIGLA_UF,
      props.NM_UF,
      props.cd_regiao,
      props.sigla_regiao,
      props.nm_regiao,
    ].filter(Boolean);

    for (const c of candidates) {
      const k1 = this.normalizeKey(c);
      if (lookup.has(k1)) return lookup.get(k1)!;
      const k2 = this.normalizeNoAccent(c);
      if (lookup.has(k2)) return lookup.get(k2)!;
      // 7-digit to 6-digit IBGE municipality fallback
      if (k1.length === 7 && /^\d+$/.test(k1)) {
        const k6 = k1.slice(0, 6);
        if (lookup.has(k6)) return lookup.get(k6)!;
      }
    }
    return 0;
  }

  private async loadLevelData(refetchGeoJson = true): Promise<void> {
    if (!this.map) return;

    this.isLoading.set(true);

    try {
      const levelId = this.selectedLevel();
      if (refetchGeoJson || !this.currentGeoJson) {
        const result = await this.malhasApi.getGeoJsonData(levelId);
        this.currentGeoJson = result.data;
      }

      const geojson = this.currentGeoJson;
      if (!geojson || !geojson.features) {
        throw new Error('Formato GeoJSON inválido recebido.');
      }

      this.featuresCount.set(geojson.features.length);

      let featureValues: number[] = [];
      const geoVar = this.selectedGeoVar();
      const analysis = this.config();

      if (geoVar !== '__area__' && analysis) {
        try {
          const appDataDir = await this.datasetApi.getAppDataDir();
          const filePath = `${appDataDir}/processed_data/${analysis.groupName}/analysis_ready.csv`;
          const valCol = this.selectedValueVar() || geoVar;
          const met = this.selectedMetric();

          const barData = await this.analysisApi.getBarChartData(filePath, geoVar, valCol, met);
          const lookup = new Map<string, number>();
          barData.categories.forEach((cat, idx) => {
            const val = Number(barData.values[idx]) || 0;
            lookup.set(this.normalizeKey(cat), val);
            lookup.set(this.normalizeNoAccent(cat), val);
          });

          featureValues = geojson.features.map((f: any) => this.matchFeatureInLookup(f, lookup));
        } catch (err: any) {
          console.error('Erro ao consultar dados via Polars para o mapa:', err);
          this.snackBar.open(
            'Não foi possível ler o CSV consolidado (verifique se executou o ETL na Análise Descritiva). Exibindo proporção territorial.',
            'Fechar',
            { duration: 6000 }
          );
          this.selectedGeoVar.set('__area__');
        }
      }

      if (this.selectedGeoVar() === '__area__' || featureValues.length === 0) {
        let totalArea = 0;
        const areas: number[] = [];

        for (const feature of geojson.features) {
          const approxArea = this.calculateFeatureApproxArea(feature);
          areas.push(approxArea);
          totalArea += approxArea;
        }

        featureValues = areas.map((a) => (totalArea > 0 ? (a / totalArea) * 100 : 0));
      }

      const locations = geojson.features.map((f: any) => this.getFeatureCanonicalKey(f));
      this.lastLocations.set(locations);
      this.lastValues.set(featureValues);

      const total = featureValues.reduce((acc, v) => acc + v, 0);
      const minV = featureValues.length > 0 ? Math.min(...featureValues) : 0;
      const maxV = featureValues.length > 0 ? Math.max(...featureValues) : 0;

      this.minVal.set(minV);
      this.maxVal.set(maxV);
      this.totalVal.set(total);

      // Limpar camada anterior se houver
      if (this.geojsonLayer) {
        this.map.removeLayer(this.geojsonLayer);
        this.geojsonLayer = null;
      }

      const isAreaMode = this.selectedGeoVar() === '__area__';

      // Adicionar camada temática com estilo coroplético
      this.geojsonLayer = L.geoJSON(geojson, {
        style: (feature) => {
          const index = geojson.features.indexOf(feature!);
          const val = featureValues[index] ?? 0;
          return {
            fillColor: this.getColorForValue(val, minV, maxV),
            weight: 1.2,
            opacity: 1,
            color: '#ffffff',
            dashArray: '',
            fillOpacity: 0.8,
          };
        },
        onEachFeature: (feature, layer) => {
          const index = geojson.features.indexOf(feature);
          const val = featureValues[index] ?? 0;
          const pct = total > 0 ? (val / total) * 100 : 0;
          const props = feature.properties || {};
          const nome = props.nome || props.NM_UF || props.name || 'Área';
          const sigla = props.sigla || props.SIGLA_UF || '';
          const cod = props.codarea || props.CD_UF || '';

          const formattedVal = isAreaMode
            ? `${val.toFixed(2)}%`
            : `${val.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} (${pct.toFixed(1)}%)`;

          const tooltipContent = `
            <strong>${nome} ${sigla ? '(' + sigla + ')' : ''}</strong><br/>
            ${cod ? 'Código: ' + cod + '<br/>' : ''}
            ${isAreaMode ? 'Proporção' : 'Valor'}: <strong>${formattedVal}</strong>
          `;

          layer.bindTooltip(tooltipContent, {
            sticky: true,
            className: 'thematic-tooltip',
          });

          layer.on({
            mouseover: (e) => {
              const target = e.target;
              target.setStyle({
                weight: 2.5,
                color: '#222222',
                fillOpacity: 0.95,
              });
              if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
                target.bringToFront();
              }
            },
            mouseout: (e) => {
              this.geojsonLayer?.resetStyle(e.target);
            },
          });
        },
      }).addTo(this.map);

      if (refetchGeoJson && this.geojsonLayer.getBounds().isValid()) {
        this.map.fitBounds(this.geojsonLayer.getBounds(), { padding: [20, 20] });
      }
    } catch (err) {
      console.error('Erro ao carregar malha temática:', err);
    } finally {
      this.isLoading.set(false);
    }
  }

  async publishArtifact(): Promise<void> {
    const analysis = this.config();
    if (!analysis) {
      this.snackBar.open(
        'Selecione uma Análise Descritiva antes de publicar o mapa.',
        'Fechar',
        { duration: 4000 }
      );
      return;
    }

    const locations = this.lastLocations();
    const values = this.lastValues();
    if (locations.length === 0 || values.length === 0) {
      this.snackBar.open('Nenhum dado carregado no mapa para publicar.', 'Fechar', {
        duration: 3000,
      });
      return;
    }

    const label = prompt('Digite um rótulo para esta publicação de mapa:');
    if (!label) return;

    const isAreaMode = this.selectedGeoVar() === '__area__';
    const scaleColors = this.colorScale();

    const artifact: AnalysisArtifact = {
      id: crypto.randomUUID(),
      label,
      type: 'map_choropleth',
      geoLevel: this.selectedLevel(),
      colorScale: scaleColors,
      valueDisplayMode: isAreaMode ? 'percent' : 'both',
      percentDecimals: 1,
      params: {
        geoLevel: this.selectedLevel(),
        categoryVar: isAreaMode ? 'Proporção Territorial' : this.selectedGeoVar(),
        valueVar: this.selectedValueVar() || undefined,
        metric: isAreaMode ? 'percent_area' : this.selectedMetric(),
        colorScaleName: this.selectedColorScaleName(),
        colorScale: scaleColors,
        isAreaMode,
        valueDisplayMode: isAreaMode ? 'percent' : 'both',
      },
      data: {
        x: locations,
        y: values,
        locations,
        values,
      },
      createdAt: new Date().toISOString(),
    };

    const updatedAnalysis: AnalysisConfig = {
      ...analysis,
      publishedArtifacts: [...(analysis.publishedArtifacts || []), artifact],
    };

    await this.stateService.saveAnalysis(updatedAnalysis);

    const snackRef = this.snackBar.open('Mapa publicado com sucesso!', 'Ver Publicação', {
      duration: 5000,
    });
    snackRef.onAction().subscribe(() => {
      if (updatedAnalysis.id) {
        this.router.navigate(['/published', updatedAnalysis.id, artifact.id]);
      }
    });
  }

  formatLegendValue(val: number): string {
    if (this.selectedGeoVar() === '__area__') {
      return `${val.toFixed(2)}%`;
    }
    return val.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  }

  private getColorForValue(value: number, min: number, max: number): string {
    const scale = this.colorScale();
    if (max <= min) return scale[Math.floor(scale.length / 2)];
    const ratio = (value - min) / (max - min);
    const index = Math.min(Math.floor(ratio * scale.length), scale.length - 1);
    return scale[Math.max(0, index)];
  }

  // Cálculo aproximado de área em coordenadas esféricas
  private calculateFeatureApproxArea(feature: any): number {
    if (!feature || !feature.geometry) return 0;
    const geom = feature.geometry;

    if (geom.type === 'Polygon') {
      return this.ringArea(geom.coordinates[0]);
    } else if (geom.type === 'MultiPolygon') {
      let sum = 0;
      for (const poly of geom.coordinates) {
        sum += this.ringArea(poly[0]);
      }
      return sum;
    }
    return 1;
  }

  private ringArea(coords: number[][]): number {
    if (!coords || coords.length < 3) return 0;
    let area = 0;
    for (let i = 0; i < coords.length - 1; i++) {
      const [x1, y1] = coords[i];
      const [x2, y2] = coords[i + 1];
      area += x1 * y2 - x2 * y1;
    }
    return Math.abs(area) / 2;
  }
}
