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
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

// Plotly via Window Integration (requires script in index.html)
import { PlotlyModule } from 'angular-plotly.js';

import { DatasetStateService } from '../../../../../services/dataset-state.service';
import { isTauri } from '../../../../../services/environment';
import { AnalysisArtifact, AnalysisConfig } from '../../../../../models';
import { AutoTooltipDirective } from '../../../../../directives';

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
    MatDividerModule,
    MatTooltipModule,
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
  tempShowBarValues = false;
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

  preparePlotlyData(artifact: AnalysisArtifact, useTempValues = false) {
    const { categoryVar, metric, statisticalType, chartType } = artifact.params;
    const showValues = useTempValues ? this.tempShowBarValues : artifact.params.showBarValues;
    const isLine = artifact.type === 'linechart' || chartType === 'line';
    
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
      traces = artifact.data.series.map(s => {
        const sortedY = indices.map(i => s.values[i] ?? 0);
        const trace: any = {
          x: sortedX,
          y: sortedY,
          name: s.name,
          type: isLine ? 'scatter' : 'bar',
        };

        if (isLine) {
          trace.mode = showValues ? 'lines+markers+text' : 'lines+markers';
          trace.line = { shape: 'linear', width: 2.8 };
          trace.marker = { size: 7 };
          if (showValues) {
            trace.text = sortedY.map(v => Number.isInteger(v) ? v.toString() : v.toFixed(2));
            trace.textposition = 'top center';
          }
        } else {
          if (showValues) {
            trace.text = sortedY.map(v => Number.isInteger(v) ? v.toString() : v.toFixed(2));
            trace.textposition = 'auto';
          }
        }
        return trace;
      });
    } else {
      const rawY = artifact.data?.y || [];
      const sortedY = indices.map(i => rawY[i] ?? 0);
      const trace: any = {
        x: sortedX,
        y: sortedY,
        name: artifact.params.valueVar || 'Valor',
        type: isLine ? 'scatter' : 'bar',
      };

      if (isLine) {
        trace.mode = showValues ? 'lines+markers+text' : 'lines+markers';
        trace.line = { shape: 'linear', width: 2.8 };
        trace.marker = { size: 7 };
        if (showValues) {
          trace.text = sortedY.map(v => Number.isInteger(v) ? v.toString() : v.toFixed(2));
          trace.textposition = 'top center';
        }
      } else {
        trace.marker = { color: '#3f51b5' };
        if (showValues) {
          trace.text = sortedY.map(v => Number.isInteger(v) ? v.toString() : v.toFixed(2));
          trace.textposition = 'auto';
        }
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
    this.tempShowBarValues = !!art.params.showBarValues;
    
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
    art.params.showBarValues = this.tempShowBarValues;
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

  goBack() {
    this.router.navigate(['/desktop/analysis/descritiva']);
  }
}
