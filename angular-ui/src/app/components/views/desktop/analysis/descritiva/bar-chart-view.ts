import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

// Plotly via Window Integration (requires script in index.html)
import { PlotlyModule } from 'angular-plotly.js';

import { DatasetStateService } from '../../../../../services/dataset-state.service';
import { AnalysisApiService } from '../../../../../services/analysis-api.service';
import { DatasetApiService } from '../../../../../services/dataset-api.service';
import { AnalysisArtifact, BarChartData } from '../../../../../models';

@Component({
  selector: 'app-bar-chart-view',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatButtonToggleModule,
    MatTooltipModule,
    MatDividerModule,
    MatSlideToggleModule,
    FormsModule,
    PlotlyModule,
  ],
  templateUrl: './bar-chart-view.html',
  styleUrl: './bar-chart-view.css',
})
export class BarChartView implements OnInit {
  private stateService = inject(DatasetStateService);
  private analysisApi = inject(AnalysisApiService);
  private datasetApi = inject(DatasetApiService);
  private snackBar = inject(MatSnackBar);
  private router = inject(Router);

  config = this.stateService.currentAnalysis;
  
  searchQuery = signal('');
  filteredVariables = computed(() => {
    const vars = this.config()?.variables || [];
    const query = this.searchQuery().toLowerCase().trim();
    if (!query) return vars;
    return vars.filter(v => v.name.toLowerCase().includes(query));
  });

  categoryVar = signal<string | null>(null);
  valueVar = signal<string | null>(null);
  metric = signal<string>('count');
  showBarValues = signal<boolean>(false);
  isLoading = signal(false);

  categoryDesc = computed(() => {
    const cat = this.categoryVar();
    if (!cat) return null;
    return this.config()?.variables.find(v => v.name === cat)?.description || null;
  });

  valueDesc = computed(() => {
    const val = this.valueVar();
    if (!val) return null;
    return this.config()?.variables.find(v => v.name === val)?.description || null;
  });

  graphData: any = null;
  lastResultData: BarChartData | null = null;

  metricLabel = () => {
    switch(this.metric()) {
      case 'sum': return 'Soma';
      case 'avg': return 'Média';
      default: return 'Contagem';
    }
  }

  ngOnInit() {
    if (!this.config()) {
      this.router.navigate(['/desktop/analysis/descritiva']);
    }
  }

  toggleBarValues(show: boolean) {
    this.showBarValues.set(show);
    if (this.lastResultData && this.categoryVar()) {
      this.preparePlotlyData(
        this.lastResultData.categories, 
        this.lastResultData.values, 
        this.categoryVar()!, 
        this.metric()
      );
    }
  }

  setX(name: string) {
    if (this.categoryVar() === name) {
      this.categoryVar.set(null);
    } else {
      this.categoryVar.set(name);
    }
    this.updateChart();
  }

  setY(name: string) {
    if (this.valueVar() === name) {
      this.valueVar.set(null);
    } else {
      this.valueVar.set(name);
    }
    this.updateChart();
  }

  async updateChart() {
    const cat = this.categoryVar();
    const val = this.valueVar() || cat;
    const met = this.metric();
    const analysis = this.config();

    if (!cat || !analysis) {
      this.graphData = null;
      return;
    }

    this.isLoading.set(true);
    try {
      const appDataDir = await this.datasetApi.getAppDataDir();
      const filePath = `${appDataDir}/processed_data/${analysis.groupName}/analysis_ready.csv`;
      
      const data = await this.analysisApi.getBarChartData(filePath, cat, val, met);

      this.lastResultData = data;
      this.preparePlotlyData(data.categories, data.values, cat, met);
    } catch (err) {
      console.error('Erro ao gerar gráfico:', err);
      this.snackBar.open('Erro ao gerar gráfico: ' + err, 'Fechar', { duration: 5000 });
    } finally {
      this.isLoading.set(false);
    }
  }

  preparePlotlyData(x: string[], y: number[], title: string, metric: string) {
    const analysis = this.config();
    const xVarInfo = analysis?.variables.find(v => v.name === title);
    const statType = xVarInfo?.statisticalType;
    const plotlyType = this.mapToPlotlyType(statType);

    // Create pairs and sort based on statistical type
    let paired = x.map((val, i) => ({ x: val, y: y[i] }));
    
    if (statType === 'qualitativa_ordinal' || statType === 'categorica_temporal_ano') {
      paired.sort((a, b) => {
        const na = parseFloat(a.x);
        const nb = parseFloat(b.x);
        if (!isNaN(na) && !isNaN(nb)) return na - nb;
        return a.x.localeCompare(b.x, undefined, { numeric: true, sensitivity: 'base' });
      });
    }

    const sortedX = paired.map(p => p.x);
    const sortedY = paired.map(p => p.y);

    const trace: any = {
      x: sortedX,
      y: sortedY,
      type: 'bar',
      marker: { color: '#3f51b5' }
    };

    if (this.showBarValues()) {
      trace.text = sortedY.map(v => Number.isInteger(v) ? v.toString() : v.toFixed(2));
      trace.textposition = 'auto';
    }

    this.graphData = {
      data: [trace],
      layout: {
        title: `${this.metricLabel()} de ${this.valueVar() || title} por ${title}`,
        xaxis: { 
          title: title, 
          type: plotlyType,
          categoryorder: (statType === 'qualitativa_ordinal' || statType === 'categorica_temporal_ano') ? 'category ascending' : 'trace',
          automargin: true 
        },
        yaxis: { title: this.metricLabel(), automargin: true },
        margin: { t: 50, b: 100, l: 60, r: 20 }
      },
      config: { responsive: true, displayModeBar: false }
    };
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
        return 'linear';
      default:
        return '-'; // Plotly auto-detect
    }
  }

  async publishArtifact() {
    if (!this.lastResultData) return;

    const label = prompt('Digite um rótulo para esta publicação:');
    if (!label) return;

    const analysis = this.config();
    if (!analysis) return;

    const cat = this.categoryVar();
    const xVarInfo = analysis.variables.find(v => v.name === cat);

    const artifact: AnalysisArtifact = {
      id: crypto.randomUUID(),
      label: label,
      type: 'barchart',
      params: {
        categoryVar: cat || '',
        valueVar: this.valueVar() || undefined,
        metric: this.metric(),
        statisticalType: xVarInfo?.statisticalType, // Persist for rendering
        showBarValues: this.showBarValues()
      },
      data: {
        x: this.lastResultData.categories,
        y: this.lastResultData.values
      },
      createdAt: new Date().toISOString()
    };

    if (!analysis.publishedArtifacts) {
      analysis.publishedArtifacts = [];
    }
    analysis.publishedArtifacts.push(artifact);

    await this.stateService.saveAnalysis(analysis);
    this.snackBar.open('Gráfico publicado com sucesso!', 'OK', { duration: 3000 });
  }

  goBack() {
    this.router.navigate(['/desktop/analysis/descritiva']);
  }
}
