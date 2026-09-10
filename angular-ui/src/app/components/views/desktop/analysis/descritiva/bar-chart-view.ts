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
import { MatSelectModule } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

// Plotly via Window Integration (requires script in index.html)
import { PlotlyModule } from 'angular-plotly.js';

import { DatasetStateService } from '../../../../../services/dataset-state.service';
import { AnalysisApiService } from '../../../../../services/analysis-api.service';
import { DatasetApiService } from '../../../../../services/dataset-api.service';
import { AnalysisArtifact, BarChartData } from '../../../../../models';
import { AutoTooltipDirective } from '../../../../../directives';

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
    MatSelectModule,
    FormsModule,
    PlotlyModule,
    AutoTooltipDirective,
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
    return vars.filter(v => v.name.toLowerCase().includes(query) || (v.description && v.description.toLowerCase().includes(query)));
  });

  categoryVar = signal<string | null>(null);
  valueVars = signal<string[]>([]);
  chartType = signal<'line' | 'bar'>('line');
  metric = signal<string>('count');
  showValues = signal<boolean>(false);
  isLoading = signal(false);
  isLoadingPreview = signal(false);

  previewCols = signal<string[]>([]);
  previewRows = signal<Record<string, string>[]>([]);

  categoryDesc = computed(() => {
    const cat = this.categoryVar();
    if (!cat) return null;
    return this.config()?.variables.find(v => v.name === cat)?.description || null;
  });

  selectedYVariablesInfo = computed(() => {
    const vars = this.valueVars();
    const allVars = this.config()?.variables || [];
    return vars.map(name => {
      const found = allVars.find(v => v.name === name);
      return {
        name,
        type: found?.type || 'Número',
        description: found?.description
      };
    });
  });

  graphData: any = null;
  private lastResults: Array<{ yVar: string; data: BarChartData }> = [];

  statisticalTypes = [
    { value: 'categorica_temporal_ano', label: 'Temporal (Ano)' },
    { value: 'categorica_temporal_timestamp', label: 'Temporal (Timestamp)' },
    { value: 'qualitativa_nominal', label: 'Qualitativa Nominal' },
    { value: 'qualitativa_ordinal', label: 'Qualitativa Ordinal' },
    { value: 'quantitativa_discreta', label: 'Quantitativa Discreta' },
    { value: 'quantitativa_continua', label: 'Quantitativa Contínua' },
  ];

  metricLabel = () => {
    switch(this.metric()) {
      case 'sum': return 'Soma';
      case 'avg': return 'Média';
      default: return 'Contagem';
    }
  }

  isY(name: string): boolean {
    return this.valueVars().includes(name);
  }

  getVariableStatisticalType(varName: string): string {
    const v = this.config()?.variables.find(item => item.name === varName);
    return v?.statisticalType || 'quantitativa_discreta';
  }

  getStatisticalTypeLabel(typeValue: string): string {
    const found = this.statisticalTypes.find(t => t.value === typeValue);
    return found?.label || typeValue;
  }

  async onStatisticalTypeChange(varName: string, newType: string) {
    const analysis = this.config();
    if (!analysis) return;

    const targetVar = analysis.variables.find(v => v.name === varName);
    if (targetVar) {
      targetVar.statisticalType = newType;
      await this.stateService.saveAnalysis(analysis);
      this.snackBar.open(
        `Classificação de "${varName}" atualizada para "${this.getStatisticalTypeLabel(newType)}"`,
        'OK',
        { duration: 2500 }
      );

      if (this.categoryVar() === varName || this.isY(varName)) {
        if (this.lastResults.length > 0 && this.categoryVar()) {
          this.preparePlotlyData(this.lastResults, this.categoryVar()!, this.metric());
        }
      }
    }
  }

  ngOnInit() {
    if (!this.config()) {
      this.router.navigate(['/desktop/analysis/descritiva']);
    }
  }

  setChartType(type: 'line' | 'bar') {
    this.chartType.set(type);
    if (this.lastResults.length > 0 && this.categoryVar()) {
      this.preparePlotlyData(this.lastResults, this.categoryVar()!, this.metric());
    }
  }

  toggleShowValues(show: boolean) {
    this.showValues.set(show);
    if (this.lastResults.length > 0 && this.categoryVar()) {
      this.preparePlotlyData(this.lastResults, this.categoryVar()!, this.metric());
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

  toggleY(name: string) {
    const current = this.valueVars();
    if (current.includes(name)) {
      this.valueVars.set(current.filter(v => v !== name));
    } else {
      this.valueVars.set([...current, name]);
    }
    this.updateChart();
  }

  removeY(name: string, event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    this.valueVars.update(list => list.filter(v => v !== name));
    this.updateChart();
  }

  clearAllY() {
    this.valueVars.set([]);
    this.updateChart();
  }

  async updateChart() {
    const cat = this.categoryVar();
    const yVars = this.valueVars();
    const met = this.metric();
    const analysis = this.config();

    if (!cat || !analysis) {
      this.graphData = null;
      this.previewCols.set([]);
      this.previewRows.set([]);
      this.lastResults = [];
      return;
    }

    this.isLoading.set(true);
    try {
      const appDataDir = await this.datasetApi.getAppDataDir();
      const filePath = `${appDataDir}/processed_data/${analysis.groupName}/analysis_ready.csv`;
      
      let results: Array<{ yVar: string; data: BarChartData }> = [];

      if (yVars.length === 0) {
        const valCol = cat;
        const data = await this.analysisApi.getBarChartData(filePath, cat, valCol, met);
        results = [{ yVar: met === 'count' ? 'Frequência' : cat, data }];
      } else {
        results = await Promise.all(
          yVars.map(async (y) => {
            const data = await this.analysisApi.getBarChartData(filePath, cat, y, met);
            return { yVar: y, data };
          })
        );
      }

      this.lastResults = results;
      this.preparePlotlyData(results, cat, met);

      // Carregar pré-visualização de linhas das variáveis selecionadas
      this.fetchDataPreview(filePath, cat, yVars);
    } catch (err) {
      console.error('Erro ao gerar gráfico:', err);
      this.snackBar.open('Erro ao gerar gráfico: ' + err, 'Fechar', { duration: 5000 });
    } finally {
      this.isLoading.set(false);
    }
  }

  private async fetchDataPreview(filePath: string, cat: string, yVars: string[]) {
    const colsToPreview = Array.from(new Set([cat, ...yVars]));
    this.isLoadingPreview.set(true);
    try {
      const sampleMap = await this.analysisApi.getVariablesPreview(filePath, colsToPreview, 10);
      const maxLen = Math.max(0, ...Object.values(sampleMap).map(v => v.length));
      const rows: Record<string, string>[] = [];
      for (let i = 0; i < maxLen; i++) {
        const row: Record<string, string> = {};
        for (const col of colsToPreview) {
          row[col] = sampleMap[col]?.[i] ?? '';
        }
        rows.push(row);
      }
      this.previewCols.set(colsToPreview);
      this.previewRows.set(rows);
    } catch (err) {
      console.warn('Erro ao carregar pré-visualização das linhas:', err);
    } finally {
      this.isLoadingPreview.set(false);
    }
  }

  preparePlotlyData(results: Array<{ yVar: string; data: BarChartData }>, cat: string, metric: string) {
    const analysis = this.config();
    const xVarInfo = analysis?.variables.find(v => v.name === cat);
    const statType = xVarInfo?.statisticalType;
    const plotlyType = this.mapToPlotlyType(statType);

    // Coletar todas as categorias únicas de todas as séries
    const catSet = new Set<string>();
    results.forEach(res => {
      res.data.categories.forEach(c => catSet.add(c));
    });
    const allCategories = Array.from(catSet);

    // Ordenar categorias (numericamente se forem anos/números, ou alfabeticamente)
    allCategories.sort((a, b) => {
      const na = parseFloat(a);
      const nb = parseFloat(b);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });

    const isLine = this.chartType() === 'line';
    const showVals = this.showValues();

    const traces = results.map(item => {
      const catToVal = new Map<string, number>();
      item.data.categories.forEach((c, idx) => {
        catToVal.set(c, item.data.values[idx]);
      });

      const sortedY = allCategories.map(c => catToVal.get(c) ?? 0);

      const trace: any = {
        x: allCategories,
        y: sortedY,
        name: item.yVar,
        type: isLine ? 'scatter' : 'bar',
      };

      if (isLine) {
        trace.mode = showVals ? 'lines+markers+text' : 'lines+markers';
        trace.line = { shape: 'linear', width: 2.8 };
        trace.marker = { size: 7 };
        if (showVals) {
          trace.text = sortedY.map(v => Number.isInteger(v) ? v.toString() : v.toFixed(2));
          trace.textposition = 'top center';
        }
      } else {
        if (showVals) {
          trace.text = sortedY.map(v => Number.isInteger(v) ? v.toString() : v.toFixed(2));
          trace.textposition = 'auto';
        }
      }

      return trace;
    });

    const yNames = this.valueVars().length > 0 
      ? this.valueVars().join(', ') 
      : (metric === 'count' ? 'Frequência' : cat);
    
    const chartTitle = `${this.metricLabel()} de ${yNames} por ${cat}`;

    this.graphData = {
      data: traces,
      layout: {
        title: {
          text: chartTitle,
          font: { size: 15, color: '#1e293b' }
        },
        xaxis: { 
          title: cat, 
          type: plotlyType,
          categoryorder: 'array',
          categoryarray: allCategories,
          automargin: true 
        },
        yaxis: { 
          title: this.metricLabel(), 
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
        return 'category'; // Default to category on X axis so years and discrete codes are distinct points!
      default:
        return 'category';
    }
  }

  async publishArtifact() {
    if (this.lastResults.length === 0) return;

    const label = prompt('Digite um rótulo para esta publicação:');
    if (!label) return;

    const analysis = this.config();
    if (!analysis) return;

    const cat = this.categoryVar();
    const xVarInfo = analysis.variables.find(v => v.name === cat);
    const isLine = this.chartType() === 'line';

    // Coletar todas as categorias únicas ordenadas
    const catSet = new Set<string>();
    this.lastResults.forEach(res => {
      res.data.categories.forEach(c => catSet.add(c));
    });
    const allCategories = Array.from(catSet);
    allCategories.sort((a, b) => {
      const na = parseFloat(a);
      const nb = parseFloat(b);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });

    const series = this.lastResults.map(item => {
      const catToVal = new Map<string, number>();
      item.data.categories.forEach((c, idx) => {
        catToVal.set(c, item.data.values[idx]);
      });
      return {
        name: item.yVar,
        values: allCategories.map(c => catToVal.get(c) ?? 0)
      };
    });

    const artifact: AnalysisArtifact = {
      id: crypto.randomUUID(),
      label: label,
      type: isLine ? 'linechart' : 'barchart',
      params: {
        categoryVar: cat || '',
        valueVars: this.valueVars(),
        valueVar: this.valueVars()[0] || undefined,
        chartType: this.chartType(),
        metric: this.metric(),
        statisticalType: xVarInfo?.statisticalType,
        showBarValues: this.showValues()
      },
      data: {
        x: allCategories,
        y: series[0]?.values || [],
        series: series
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
