import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatSelectModule } from '@angular/material/select';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import * as L from 'leaflet';

// Plotly via Window Integration (requires script in index.html)
import { PlotlyModule } from 'angular-plotly.js';

import { DatasetStateService } from '../../../../../services/dataset-state.service';
import { IbgeMalhasApiService } from '../../../../../services/ibge-malhas-api.service';
import { isTauri } from '../../../../../services/environment';
import { AnalysisArtifact, AnalysisConfig } from '../../../../../models';
import { AutoTooltipDirective } from '../../../../../directives';
import { ConfirmDialog } from './descritiva-view';
import { CHOROPLETH_COLOR_SCALES } from '../map/thematic-map-view';

@Component({
  selector: 'app-published-artifact-view',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatFormFieldModule,
    MatInputModule,
    MatSnackBarModule,
    MatSlideToggleModule,
    MatButtonToggleModule,
    MatSelectModule,
    MatDividerModule,
    MatTooltipModule,
    MatDialogModule,
    FormsModule,
    PlotlyModule,
    AutoTooltipDirective,
  ],
  templateUrl: './published-artifact-view.html',
  styleUrl: './published-artifact-view.css',
})
export class PublishedArtifactView implements OnInit, OnDestroy {
  @ViewChild('publishedMapContainer', { static: false })
  publishedMapContainer?: ElementRef<HTMLDivElement>;

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private stateService = inject(DatasetStateService);
  private malhasApi = inject(IbgeMalhasApiService);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);

  analysis = signal<AnalysisConfig | null>(null);
  artifact = signal<AnalysisArtifact | null>(null);
  isLoading = signal(true);
  error = signal<string | null>(null);

  isDesktop = signal(isTauri());
  isEditing = signal(false);
  isMapArtifact = computed(() => this.artifact()?.type === 'map_choropleth');

  // Map state for Published Choropleth
  private leafletMap: L.Map | null = null;
  private geojsonLayer: L.GeoJSON | null = null;
  private cachedGeoJson: any = null;
  private cachedGeoLevel: string | null = null;
  mapMinVal = signal<number>(0);
  mapMaxVal = signal<number>(0);
  mapColorScale = signal<string[]>(CHOROPLETH_COLOR_SCALES['Blues'].colors);
  colorScaleKeys = Object.keys(CHOROPLETH_COLOR_SCALES);
  colorScales = CHOROPLETH_COLOR_SCALES;

  tempLabel = '';
  tempXTitle = '';
  tempYTitle = '';
  tempYPrefix = '';
  tempYSuffix = '';
  tempValueDisplayMode: 'none' | 'value' | 'percent' | 'both' = 'none';
  tempPercentBaseMode: 'series_sum' | 'custom' | 'category_sum' = 'series_sum';
  tempCustomPercentTotal: number | null = null;
  tempPercentDecimals: number = 1;
  tempXLabelMap: Record<string, string> = {};
  tempLegendLabelMap: Record<string, string> = {};
  tempColorScaleName: string = 'Blues';

  graphData: any = null;

  ngOnInit() {
    this.route.params.subscribe((params) => {
      this.loadArtifact(params['analysisId'], params['artifactId']);
    });
  }

  ngOnDestroy() {
    this.destroyLeafletMap();
  }

  private destroyLeafletMap() {
    if (this.leafletMap) {
      this.leafletMap.remove();
      this.leafletMap = null;
      this.geojsonLayer = null;
    }
  }

  async loadArtifact(analysisId: string, artifactId: string) {
    this.isLoading.set(true);
    this.error.set(null);
    this.destroyLeafletMap();

    try {
      let analyses = this.stateService.allAnalyses();
      if (analyses.length === 0) {
        await this.stateService.refreshHistory();
        analyses = this.stateService.allAnalyses();
      }

      const targetAnalysis = analyses.find((a) => a.id === analysisId);

      if (!targetAnalysis) {
        this.error.set('Configuração de análise não encontrada.');
        return;
      }

      const targetArtifact = targetAnalysis.publishedArtifacts?.find(
        (art) => art.id === artifactId
      );

      if (!targetArtifact) {
        this.error.set('Artefato publicado não encontrado.');
        return;
      }

      this.analysis.set(targetAnalysis);
      this.artifact.set(targetArtifact);

      if (targetArtifact.type === 'map_choropleth' && targetArtifact.data) {
        this.graphData = null;
        this.isLoading.set(false);
        setTimeout(() => {
          this.renderMapArtifact(targetArtifact);
        }, 0);
        return;
      } else if (
        targetArtifact.data &&
        (targetArtifact.type === 'barchart' || targetArtifact.type === 'linechart')
      ) {
        this.preparePlotlyData(targetArtifact);
      } else {
        this.error.set(
          'Este artefato não contém dados persistidos ou é de um tipo sem suporte web.'
        );
      }
    } catch (err: any) {
      console.error('Erro ao carregar artefato:', err);
      this.error.set(err.toString());
    } finally {
      this.isLoading.set(false);
    }
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

  private matchFeatureInLookup(feature: any, lookup: Map<string, number>): number {
    const props = feature?.properties || {};
    const candidates = [
      props.sigla,
      props.SIGLA_UF,
      props.codarea,
      props.CD_UF,
      props.nome,
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
      if (k1.length === 7 && /^\d+$/.test(k1)) {
        const k6 = k1.slice(0, 6);
        if (lookup.has(k6)) return lookup.get(k6)!;
      }
    }
    return 0;
  }

  async renderMapArtifact(artifact: AnalysisArtifact, useTempValues = false): Promise<void> {
    const containerEl = this.publishedMapContainer?.nativeElement;
    if (!containerEl) return;

    if (!this.leafletMap) {
      this.leafletMap = L.map(containerEl, {
        center: [-14.235, -51.9253],
        zoom: 4,
        minZoom: 3,
        maxZoom: 12,
      });

      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(this.leafletMap);
    } else {
      this.leafletMap.invalidateSize();
    }

    const geoLevel = artifact.geoLevel || artifact.params?.['geoLevel'] || 'uf';

    if (!this.cachedGeoJson || this.cachedGeoLevel !== geoLevel) {
      const res = await this.malhasApi.getGeoJsonData(geoLevel);
      this.cachedGeoJson = res.data;
      this.cachedGeoLevel = geoLevel;
    }

    const geojson = this.cachedGeoJson;
    if (!geojson || !geojson.features) return;

    const scaleName = useTempValues
      ? this.tempColorScaleName
      : artifact.params?.['colorScaleName'] || 'Blues';
    const scaleColors =
      CHOROPLETH_COLOR_SCALES[scaleName]?.colors ||
      artifact.colorScale ||
      artifact.params?.['colorScale'] ||
      CHOROPLETH_COLOR_SCALES['Blues'].colors;

    this.mapColorScale.set(scaleColors);

    const rawLocations: string[] = artifact.data?.locations || artifact.data?.x || [];
    const rawValues: number[] = (artifact.data?.values || artifact.data?.y || []).map(
      (v) => Number(v) || 0
    );

    const lookup = new Map<string, number>();
    rawLocations.forEach((loc, idx) => {
      const val = rawValues[idx] ?? 0;
      lookup.set(this.normalizeKey(loc), val);
      lookup.set(this.normalizeNoAccent(loc), val);
    });

    const featureValues: number[] = geojson.features.map((f: any, idx: number) => {
      const matched = this.matchFeatureInLookup(f, lookup);
      if (matched !== 0 || lookup.size > 0) return matched;
      return rawValues[idx] ?? 0;
    });

    const total = featureValues.reduce((acc, v) => acc + v, 0);
    const minV = featureValues.length > 0 ? Math.min(...featureValues) : 0;
    const maxV = featureValues.length > 0 ? Math.max(...featureValues) : 0;

    this.mapMinVal.set(minV);
    this.mapMaxVal.set(maxV);

    if (this.geojsonLayer) {
      this.leafletMap.removeLayer(this.geojsonLayer);
      this.geojsonLayer = null;
    }

    const displayMode: 'none' | 'value' | 'percent' | 'both' = useTempValues
      ? this.tempValueDisplayMode
      : artifact.valueDisplayMode || artifact.params?.['valueDisplayMode'] || 'both';
    const decimals = useTempValues
      ? this.tempPercentDecimals
      : (artifact.percentDecimals ?? 1);

    this.geojsonLayer = L.geoJSON(geojson, {
      style: (feature) => {
        const index = geojson.features.indexOf(feature!);
        const val = featureValues[index] ?? 0;
        return {
          fillColor: this.getMapColor(val, minV, maxV, scaleColors),
          weight: 1.2,
          opacity: 1,
          color: '#ffffff',
          fillOpacity: 0.82,
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

        let valText = '';
        const valFormatted = val.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
        const pctFormatted = `${pct.toLocaleString('pt-BR', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })}%`;

        if (displayMode === 'percent') {
          valText = pctFormatted;
        } else if (displayMode === 'value') {
          valText = valFormatted;
        } else {
          valText = `${valFormatted} (${pctFormatted})`;
        }

        const tooltipContent = `
          <strong>${nome} ${sigla ? '(' + sigla + ')' : ''}</strong><br/>
          ${cod ? 'Código: ' + cod + '<br/>' : ''}
          Valor: <strong>${valText}</strong>
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
    }).addTo(this.leafletMap);

    if (!useTempValues && this.geojsonLayer.getBounds().isValid()) {
      this.leafletMap.fitBounds(this.geojsonLayer.getBounds(), { padding: [20, 20] });
    }
  }

  recenterMap(): void {
    if (this.geojsonLayer && this.leafletMap && this.geojsonLayer.getBounds().isValid()) {
      this.leafletMap.fitBounds(this.geojsonLayer.getBounds(), { padding: [20, 20] });
    } else if (this.leafletMap) {
      this.leafletMap.setView([-14.235, -51.9253], 4);
    }
  }

  formatMapLegendValue(val: number): string {
    const art = this.artifact();
    if (art?.params?.['isAreaMode']) {
      return `${val.toFixed(2)}%`;
    }
    return val.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  }

  private getMapColor(value: number, min: number, max: number, scale: string[]): string {
    if (max <= min) return scale[Math.floor(scale.length / 2)];
    const ratio = (value - min) / (max - min);
    const index = Math.min(Math.floor(ratio * scale.length), scale.length - 1);
    return scale[Math.max(0, index)];
  }

  formatValueLabel(
    val: number,
    mode: 'none' | 'value' | 'percent' | 'both',
    percentBase: 'series_sum' | 'custom' | 'category_sum',
    customTotal: number | null,
    decimals: number,
    seriesValues: number[],
    catIdx: number,
    allSeriesMatrix?: number[][]
  ): string {
    if (mode === 'none') return '';

    const valStr = Number.isInteger(val)
      ? val.toLocaleString('pt-BR')
      : val.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

    if (mode === 'value') return valStr;

    let total = 0;
    if (percentBase === 'custom' && customTotal && customTotal > 0) {
      total = customTotal;
    } else if (percentBase === 'category_sum' && allSeriesMatrix && allSeriesMatrix.length > 0) {
      total = allSeriesMatrix.reduce((sum, sVals) => sum + (Number(sVals[catIdx]) || 0), 0);
    } else {
      total = seriesValues.reduce((sum, v) => sum + (Number(v) || 0), 0);
    }

    const pct = total > 0 ? (val / total) * 100 : 0;
    const pctStr =
      pct.toLocaleString('pt-BR', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }) + '%';

    if (mode === 'percent') return pctStr;
    return `${valStr} (${pctStr})`;
  }

  getSeriesList(): string[] {
    const art = this.artifact();
    if (!art) return [];
    if (art.data?.series && art.data.series.length > 0) {
      return art.data.series.map((s) => s.name);
    }
    const defaultName =
      art.params?.['valueVar'] ||
      (art.params?.['metric'] === 'count' ? 'Frequência' : art.params?.['categoryVar'] || 'Valor');
    return [defaultName];
  }

  preparePlotlyData(artifact: AnalysisArtifact, useTempValues = false) {
    const { categoryVar, metric, statisticalType, chartType } = artifact.params;
    const isLine = artifact.type === 'linechart' || chartType === 'line';

    const mode: 'none' | 'value' | 'percent' | 'both' = useTempValues
      ? this.tempValueDisplayMode
      : artifact.valueDisplayMode ||
        artifact.params?.['valueDisplayMode'] ||
        (artifact.params?.['showBarValues'] ? 'value' : 'none');

    const percentBase: 'series_sum' | 'custom' | 'category_sum' = useTempValues
      ? this.tempPercentBaseMode
      : artifact.percentBaseMode || artifact.params?.['percentBaseMode'] || 'series_sum';

    const customTotal: number | null = useTempValues
      ? this.tempCustomPercentTotal
      : (artifact.customPercentTotal ?? (artifact.params?.['customPercentTotal'] ?? null));

    const decimals: number = useTempValues
      ? this.tempPercentDecimals
      : (artifact.percentDecimals ?? (artifact.params?.['percentDecimals'] ?? 1));

    // Initial mapping of labels (renaming)
    const rawX = artifact.data?.x || [];
    const xValues = rawX.map((val) =>
      artifact.xLabelMap && artifact.xLabelMap[val] ? artifact.xLabelMap[val] : val
    );

    // Create sorted indices
    const indices = xValues.map((_, i) => i);
    indices.sort((a, b) => {
      const na = parseFloat(xValues[a]);
      const nb = parseFloat(xValues[b]);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return String(xValues[a]).localeCompare(String(xValues[b]), undefined, {
        numeric: true,
        sensitivity: 'base',
      });
    });

    const sortedX = indices.map((i) => xValues[i]);
    const plotlyType = this.mapToPlotlyType(statisticalType);

    let traces: any[] = [];

    if (artifact.data?.series && artifact.data.series.length > 0) {
      const allSeriesMatrix: number[][] = artifact.data.series.map((s) =>
        indices.map((i) => s.values[i] ?? 0)
      );

      traces = artifact.data.series.map((s, sIdx) => {
        const sortedY = allSeriesMatrix[sIdx];
        const seriesLegendName =
          (useTempValues ? this.tempLegendLabelMap[s.name] : artifact.legendLabelMap?.[s.name]) ||
          s.name;
        const trace: any = {
          x: sortedX,
          y: sortedY,
          name: seriesLegendName,
          type: isLine ? 'scatter' : 'bar',
        };

        if (mode !== 'none') {
          const textArr = sortedY.map((v, catIdx) =>
            this.formatValueLabel(
              v,
              mode,
              percentBase,
              customTotal,
              decimals,
              sortedY,
              catIdx,
              allSeriesMatrix
            )
          );
          trace.text = textArr;
          trace.textposition = isLine ? 'top center' : 'auto';
        }

        if (isLine) {
          trace.mode = mode !== 'none' ? 'lines+markers+text' : 'lines+markers';
          trace.line = { shape: 'linear', width: 2.8 };
          trace.marker = { size: 7 };
        }

        return trace;
      });
    } else {
      const rawY = artifact.data?.y || [];
      const sortedY = indices.map((i) => rawY[i] ?? 0);
      const allSeriesMatrix = [sortedY];
      const defaultName =
        artifact.params?.['valueVar'] ||
        (artifact.params?.['metric'] === 'count'
          ? 'Frequência'
          : artifact.params?.['categoryVar'] || 'Valor');
      const seriesLegendName =
        (useTempValues
          ? this.tempLegendLabelMap[defaultName]
          : artifact.legendLabelMap?.[defaultName]) || defaultName;

      const trace: any = {
        x: sortedX,
        y: sortedY,
        name: seriesLegendName,
        type: isLine ? 'scatter' : 'bar',
      };

      if (mode !== 'none') {
        const textArr = sortedY.map((v, catIdx) =>
          this.formatValueLabel(
            v,
            mode,
            percentBase,
            customTotal,
            decimals,
            sortedY,
            catIdx,
            allSeriesMatrix
          )
        );
        trace.text = textArr;
        trace.textposition = isLine ? 'top center' : 'auto';
      }

      if (isLine) {
        trace.mode = mode !== 'none' ? 'lines+markers+text' : 'lines+markers';
        trace.line = { shape: 'linear', width: 2.8 };
        trace.marker = { size: 7 };
      } else {
        trace.marker = { color: '#3f51b5' };
      }
      traces = [trace];
    }

    this.graphData = {
      data: traces,
      layout: {
        title: useTempValues ? this.tempLabel : artifact.label,
        xaxis: {
          title: useTempValues ? this.tempXTitle : artifact.xTitle || categoryVar,
          type: plotlyType,
          categoryorder: 'array',
          categoryarray: sortedX,
          automargin: true,
        },
        yaxis: {
          title: useTempValues ? this.tempYTitle : artifact.yTitle || this.getMetricLabel(metric),
          tickprefix: useTempValues ? this.tempYPrefix : artifact.yPrefix || '',
          ticksuffix: useTempValues ? this.tempYSuffix : artifact.ySuffix || '',
          automargin: true,
        },
        barmode: 'group',
        hovermode: 'x unified',
        showlegend: traces.length > 1 || isLine,
        legend: {
          orientation: 'h',
          y: -0.22,
          x: 0.5,
          xanchor: 'center',
        },
        margin: { t: 50, b: 100, l: 65, r: 25 },
      },
      config: { responsive: true, displayModeBar: true },
    };
  }

  updatePreview() {
    const art = this.artifact();
    if (!art) return;
    if (art.type === 'map_choropleth') {
      this.renderMapArtifact(art, true);
    } else {
      this.preparePlotlyData(art, true);
    }
  }

  mapToPlotlyType(statType?: string): string {
    switch (statType) {
      case 'qualitativa_nominal':
      case 'qualitativa_ordinal':
      case 'categorica_temporal_ano':
        return 'category';
      case 'categorica_temporal_timestamp':
        return 'date';
      case 'quantitativa_continua':
      case 'quantitativa_discreta':
        return 'category';
      default:
        return 'category';
    }
  }

  getMetricLabel(metric: string) {
    switch (metric) {
      case 'sum':
        return 'Soma';
      case 'avg':
        return 'Média';
      case 'percent_area':
        return '% Proporção Territorial';
      default:
        return 'Contagem';
    }
  }

  startEdit() {
    const art = this.artifact();
    if (!art) return;

    this.tempLabel = art.label;
    this.tempXTitle = art.xTitle || art.params?.['categoryVar'] || '';
    this.tempYTitle = art.yTitle || this.getMetricLabel(art.params?.['metric']) || '';
    this.tempYPrefix = art.yPrefix || '';
    this.tempYSuffix = art.ySuffix || '';
    this.tempValueDisplayMode =
      art.valueDisplayMode ||
      art.params?.['valueDisplayMode'] ||
      (art.params?.['showBarValues'] ? 'value' : art.type === 'map_choropleth' ? 'both' : 'none');
    this.tempPercentBaseMode =
      art.percentBaseMode || art.params?.['percentBaseMode'] || 'series_sum';
    this.tempCustomPercentTotal =
      art.customPercentTotal ?? (art.params?.['customPercentTotal'] ?? null);
    this.tempPercentDecimals = art.percentDecimals ?? (art.params?.['percentDecimals'] ?? 1);
    this.tempColorScaleName = art.params?.['colorScaleName'] || 'Blues';

    // Clone label maps or initialize
    this.tempXLabelMap = art.xLabelMap ? { ...art.xLabelMap } : {};
    this.tempLegendLabelMap = art.legendLabelMap ? { ...art.legendLabelMap } : {};

    this.isEditing.set(true);
    if (art.type === 'map_choropleth') {
      setTimeout(() => this.leafletMap?.invalidateSize(), 50);
    }
  }

  cancelEdit() {
    this.isEditing.set(false);
    const art = this.artifact();
    if (art?.type === 'map_choropleth') {
      setTimeout(() => this.renderMapArtifact(art, false), 50);
    }
  }

  async saveChanges() {
    const art = this.artifact();
    const config = this.analysis();

    if (!art || !config) return;

    // Update artifact object
    art.label = this.tempLabel;
    art.xTitle = this.tempXTitle;
    art.yTitle = this.tempYTitle;
    art.yPrefix = this.tempYPrefix;
    art.ySuffix = this.tempYSuffix;
    art.valueDisplayMode = this.tempValueDisplayMode;
    art.percentBaseMode = this.tempPercentBaseMode;
    art.customPercentTotal = this.tempCustomPercentTotal;
    art.percentDecimals = this.tempPercentDecimals;
    art.params['showBarValues'] = this.tempValueDisplayMode !== 'none';
    art.params['valueDisplayMode'] = this.tempValueDisplayMode;
    art.params['percentBaseMode'] = this.tempPercentBaseMode;
    art.params['customPercentTotal'] = this.tempCustomPercentTotal;
    art.params['percentDecimals'] = this.tempPercentDecimals;
    art.xLabelMap = { ...this.tempXLabelMap };
    art.legendLabelMap = { ...this.tempLegendLabelMap };
    art.params['legendLabelMap'] = { ...this.tempLegendLabelMap };

    if (art.type === 'map_choropleth') {
      art.params['colorScaleName'] = this.tempColorScaleName;
      art.colorScale =
        CHOROPLETH_COLOR_SCALES[this.tempColorScaleName]?.colors ||
        CHOROPLETH_COLOR_SCALES['Blues'].colors;
      art.params['colorScale'] = art.colorScale;
    }

    // Update analysis config
    const artifactIndex = config.publishedArtifacts?.findIndex((a) => a.id === art.id);
    if (artifactIndex !== undefined && artifactIndex !== -1 && config.publishedArtifacts) {
      config.publishedArtifacts[artifactIndex] = { ...art };
    }

    try {
      await this.stateService.saveAnalysis(config);
      this.artifact.set({ ...art });
      if (art.type === 'map_choropleth') {
        await this.renderMapArtifact(art, false);
      } else {
        this.preparePlotlyData(art);
      }
      this.isEditing.set(false);
      this.snackBar.open('Alterações salvas com sucesso!', 'Fechar', { duration: 3000 });
    } catch (err) {
      console.error('Erro ao salvar alterações:', err);
      this.snackBar.open('Erro ao salvar alterações.', 'Fechar', { duration: 5000 });
    }
  }

  async deleteArtifact() {
    const art = this.artifact();
    const config = this.analysis();
    if (!art || !config?.id) return;

    const res = await firstValueFrom(
      this.dialog
        .open(ConfirmDialog, {
          data: {
            title: 'Confirmar exclusão',
            message: 'Tem certeza que deseja remover esta publicação?',
          },
        })
        .afterClosed()
    );

    if (res) {
      try {
        await this.stateService.deleteArtifact(config.id, art.id);
        this.snackBar.open('Publicação removida com sucesso', 'Fechar', { duration: 3000 });
        this.goBack();
      } catch (err: any) {
        this.snackBar.open('Erro ao remover publicação: ' + (err?.toString() || err), 'Fechar', {
          duration: 5000,
        });
      }
    }
  }

  goBack() {
    if (this.isDesktop()) {
      this.router.navigate(['/desktop/analysis/descritiva']);
    } else {
      this.router.navigate(['/']);
    }
  }
}
