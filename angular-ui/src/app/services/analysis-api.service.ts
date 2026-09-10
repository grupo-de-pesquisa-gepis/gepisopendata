import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { invoke } from '@tauri-apps/api/core';
import { firstValueFrom, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { isTauri } from './environment';
import {
  AnalysisConfig,
  BarChartData,
  ColumnInfo,
  DictionaryEntry,
  GroupAnalysis,
} from '../models';

@Injectable({
  providedIn: 'root',
})
export class AnalysisApiService {
  private http = inject(HttpClient);

  async getAnalyses(): Promise<AnalysisConfig[]> {
    if (isTauri()) {
      return await invoke<AnalysisConfig[]>('get_analyses');
    }

    const result = await firstValueFrom(
      this.http.get<AnalysisConfig[]>('data/analyses-history.json').pipe(
        catchError(() => of([]))
      )
    );
    return result || [];
  }

  async saveAnalysis(config: AnalysisConfig): Promise<void> {
    if (!isTauri()) {
      throw new Error('Salvamento de análise não disponível em modo Web.');
    }
    await invoke('save_analysis', { config });
  }

  async deleteAnalysis(id: string): Promise<void> {
    if (!isTauri()) {
      throw new Error('Exclusão de análise não disponível em modo Web.');
    }
    await invoke('delete_analysis', { id });
  }

  async runEtl(groupName: string, files: string[], columns: string[]): Promise<string> {
    if (!isTauri()) {
      throw new Error('ETL não disponível em modo Web.');
    }
    return await invoke<string>('run_etl', { groupName, files, columns });
  }

  async getBarChartData(
    filePath: string,
    categoryCol: string,
    valueCol: string,
    metric: string
  ): Promise<BarChartData> {
    if (!isTauri()) {
      throw new Error('Geração de gráfico não disponível em modo Web.');
    }
    return await invoke<BarChartData>('get_barchart_data', {
      filePath,
      categoryCol,
      valueCol,
      metric,
    });
  }

  async getVariableSample(filePath: string, columnName: string, limit = 5): Promise<string[]> {
    if (!isTauri()) {
      return [];
    }
    return await invoke<string[]>('get_variable_sample', {
      filePath,
      columnName,
      limit,
    });
  }

  async getVariablesPreview(
    filePath: string,
    columns: string[],
    limit = 10
  ): Promise<Record<string, string[]>> {
    if (!isTauri() || columns.length === 0) {
      return {};
    }
    try {
      return await invoke<Record<string, string[]>>('get_variables_preview', {
        filePath,
        columns,
        limit,
      });
    } catch (err) {
      console.warn('Fallback para get_variable_sample individual:', err);
      const result: Record<string, string[]> = {};
      await Promise.all(
        columns.map(async (col) => {
          try {
            const sample = await this.getVariableSample(filePath, col, limit);
            result[col] = sample;
          } catch {}
        })
      );
      return result;
    }
  }

  async getExcelFiles(groupName: string): Promise<string[]> {
    if (!isTauri()) {
      return [];
    }
    return await invoke<string[]>('get_excel_files', { groupName });
  }

  async parseDictionary(groupName: string, fileName: string): Promise<DictionaryEntry[]> {
    if (!isTauri()) {
      return [];
    }
    return await invoke<DictionaryEntry[]>('parse_dictionary', {
      groupName,
      fileName,
    });
  }

  async analyzeGroup(groupName: string): Promise<GroupAnalysis> {
    if (!isTauri()) {
      throw new Error('Análise de grupo não disponível em modo Web.');
    }
    return await invoke<GroupAnalysis>('analyze_group', { groupName });
  }

  async getColumnsForFiles(groupName: string, files: string[]): Promise<ColumnInfo[]> {
    if (!isTauri()) {
      return [];
    }
    return await invoke<ColumnInfo[]>('get_columns_for_files', {
      groupName,
      files,
    });
  }
}
