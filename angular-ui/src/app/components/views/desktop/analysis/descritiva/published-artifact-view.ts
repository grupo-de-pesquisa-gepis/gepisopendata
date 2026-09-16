import { Component, inject, signal, OnInit } from '@angular/core';
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

// Plotly via Window Integration (requires script in index.html)
import { PlotlyModule } from 'angular-plotly.js';

import { DatasetStateService } from '../../../../../services/dataset-state.service';
import { isTauri } from '../../../../../services/environment';
import { AnalysisArtifact, AnalysisConfig } from '../../../../../models';
import { AutoTooltipDirective } from '../../../../../directives';
import { ConfirmDialog } from './descritiva-view';

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
export class PublishedArtifactView implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private stateService = inject(DatasetStateService);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);

  analysis = signal<AnalysisConfig | null>(null);
  artifact = signal<AnalysisArtifact | null>(null);
  isLoading = signal(true);
  error = signal<string | null>(null);
  
  isDesktop = signal(isTauri());
  isEditing = signal(false);
  
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

  graphData: any = null;

  ngOnInit() {
    this.route.params.subscribe(params => {
      this.loadArtifact(params['analysisId'], params['artifactId']);
    });
  }

  async loadArtifact(analysisId: string, artifactId: string) {
    this.isLoading.set(true);
    this.error.set(null);

    try {
      const analyses = this.stateService.allAnalyses();
      const targetAnalysis = analyses.find(a => a.id === analysisId);
      
      if (!targetAnalysis) {
        this.error.set('Configuração de análise não encontrada.');
        return;
      }

      const targetArtifact = targetAnalysis.publishedArtifacts?.find(art => art.id === artifactId);
      
      if (!targetArtifact) {
        this.error.set('Artefato publicado não encontrado.');
        return;
      }

      this.analysis.set(targetAnalysis);
      this.artifact.set(targetArtifact);

      if (targetArtifact.data && (targetArtifact.type === 'barchart' || targetArtifact.type === 'linechart')) {
        this.preparePlotlyData(targetArtifact);
      } else {
        this.error.set('Este artefato não contém dados persistidos ou é de um tipo sem suporte web.');
      }

    } catch (err: any) {
      console.error('Erro ao carregar artefato:', err);
      this.error.set(err.toString());
    } finally {
      this.isLoading.set(false);
    }
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
    const pctStr = pct.toLocaleString('pt-BR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }) + '%';

    if (mode === 'percent') return pctStr;
    return `${valStr} (${pctStr})`;
  }

  preparePlotlyData(artifact: AnalysisArtifact, useTempValues = false) {
    const { categoryVar, metric, statisticalType, chartType } = artifact.params;
    const isLine = artifact.type === 'linechart' || chartType === 'line';
    
    const mode: 'none' | 'value' | 'percent' | 'both' = useTempValues
      ? this.tempValueDisplayMode
      : (artifact.valueDisplayMode || artifact.params?.valueDisplayMode || (artifact.params?.showBarValues ? 'value' : 'none'));

    const percentBase: 'series_sum' | 'custom' | 'category_sum' = useTempValues
      ? this.tempPercentBaseMode
      : (artifact.percentBaseMode || artifact.params?.percentBaseMode || 'series_sum');

    const customTotal: number | null = useTempValues
      ? this.tempCustomPercentTotal
      : (artifact.customPercentTotal ?? (artifact.params?.customPercentTotal ?? null));

    const decimals: number = useTempValues
      ? this.tempPercentDecimals
      : (artifact.percentDecimals ?? (artifact.params?.percentDecimals ?? 1));

    // Initial mapping of labels (renaming)
    const rawX = artifact.data?.x || [];
    const xValues = rawX.map(val => 
      (artifact.xLabelMap && artifact.xLabelMap[val]) ? artifact.xLabelMap[val] : val
    );

    // Create sorted indices
    const indices = xValues.map((_, i) => i);
    indices.sort((a, b) => {
      const na = parseFloat(xValues[a]);
      const nb = parseFloat(xValues[b]);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return String(xValues[a]).localeCompare(String(xValues[b]), undefined, { numeric: true, sensitivity: 'base' });
    });

    const sortedX = indices.map(i => xValues[i]);
    const plotlyType = this.mapToPlotlyType(statisticalType);

    let traces: any[] = [];

    if (artifact.data?.series && artifact.data.series.length > 0) {
      const allSeriesMatrix: number[][] = artifact.data.series.map(s => 
        indices.map(i => s.values[i] ?? 0)
      );

      traces = artifact.data.series.map((s, sIdx) => {
        const sortedY = allSeriesMatrix[sIdx];
        const trace: any = {
          x: sortedX,
          y: sortedY,
          name: s.name,
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
      const sortedY = indices.map(i => rawY[i] ?? 0);
      const allSeriesMatrix = [sortedY];

      const trace: any = {
        x: sortedX,
        y: sortedY,
        name: artifact.params.valueVar || 'Valor',
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
          title: useTempValues ? this.tempXTitle : (artifact.xTitle || categoryVar), 
          type: plotlyType,
          categoryorder: 'array',
          categoryarray: sortedX,
          automargin: true 
        },
        yaxis: { 
          title: useTempValues ? this.tempYTitle : (artifact.yTitle || this.getMetricLabel(metric)), 
          tickprefix: useTempValues ? this.tempYPrefix : (artifact.yPrefix || ''),
          ticksuffix: useTempValues ? this.tempYSuffix : (artifact.ySuffix || ''),
          automargin: true 
        },
        barmode: 'group',
        hovermode: 'x unified',
        showlegend: traces.length > 1 || isLine,
        legend: {
          orientation: 'h',
          y: -0.22,
          x: 0.5,
          xanchor: 'center'
        },
        margin: { t: 50, b: 100, l: 65, r: 25 }
      },
      config: { responsive: true, displayModeBar: true }
    };
  }

  updatePreview() {
    const art = this.artifact();
    if (!art) return;
    this.preparePlotlyData(art, true);
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
    switch(metric) {
      case 'sum': return 'Soma';
      case 'avg': return 'Média';
      default: return 'Contagem';
    }
  }

  startEdit() {
    const art = this.artifact();
    if (!art) return;
    
    this.tempLabel = art.label;
    this.tempXTitle = art.xTitle || art.params.categoryVar || '';
    this.tempYTitle = art.yTitle || this.getMetricLabel(art.params.metric) || '';
    this.tempYPrefix = art.yPrefix || '';
    this.tempYSuffix = art.ySuffix || '';
    this.tempValueDisplayMode = art.valueDisplayMode || art.params?.valueDisplayMode || (art.params?.showBarValues ? 'value' : 'none');
    this.tempPercentBaseMode = art.percentBaseMode || art.params?.percentBaseMode || 'series_sum';
    this.tempCustomPercentTotal = art.customPercentTotal ?? (art.params?.customPercentTotal ?? null);
    this.tempPercentDecimals = art.percentDecimals ?? (art.params?.percentDecimals ?? 1);
    
    // Clone label map or initialize
    this.tempXLabelMap = art.xLabelMap ? { ...art.xLabelMap } : {};
    
    this.isEditing.set(true);
  }

  cancelEdit() {
    this.isEditing.set(false);
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
    art.params.showBarValues = this.tempValueDisplayMode !== 'none';
    art.params.valueDisplayMode = this.tempValueDisplayMode;
    art.params.percentBaseMode = this.tempPercentBaseMode;
    art.params.customPercentTotal = this.tempCustomPercentTotal;
    art.params.percentDecimals = this.tempPercentDecimals;
    art.xLabelMap = { ...this.tempXLabelMap };

    // Update analysis config
    const artifactIndex = config.publishedArtifacts?.findIndex(a => a.id === art.id);
    if (artifactIndex !== undefined && artifactIndex !== -1 && config.publishedArtifacts) {
      config.publishedArtifacts[artifactIndex] = { ...art };
    }

    try {
      await this.stateService.saveAnalysis(config);
      this.artifact.set({ ...art });
      this.preparePlotlyData(art);
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
            message: 'Tem certeza que deseja remover este gráfico publicado?',
          },
        })
        .afterClosed()
    );

    if (res) {
      try {
        await this.stateService.deleteArtifact(config.id, art.id);
        this.snackBar.open('Gráfico removido com sucesso', 'Fechar', { duration: 3000 });
        this.goBack();
      } catch (err: any) {
        this.snackBar.open('Erro ao remover gráfico: ' + (err?.toString() || err), 'Fechar', { duration: 5000 });
      }
    }
  }

  goBack() {
    this.router.navigate(['/desktop/analysis/descritiva']);
  }
}
