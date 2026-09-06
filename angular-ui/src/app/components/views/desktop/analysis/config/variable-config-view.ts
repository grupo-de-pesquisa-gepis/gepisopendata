import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AnalysisApiService, DatasetStateService } from '../../../../../services';
import {
  AnalysisArtifact,
  AnalysisConfig,
  ColumnInfo,
  DictionaryEntry,
  VariableSpec,
} from '../../../../../models';

import { AutoTooltipDirective } from '../../../../../directives';

interface ConfigColumnInfo extends ColumnInfo {
  included?: boolean;
  description?: string;
  statisticalType?: string;
}

interface FileInfo {
  name: string;
  selected: boolean;
}

@Component({
  selector: 'app-variable-config-view',
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatCardModule,
    MatCheckboxModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    MatSnackBarModule,
    FormsModule,
    AutoTooltipDirective,
  ],
  templateUrl: './variable-config-view.html',
  styleUrl: './variable-config-view.css',
})
export class VariableConfigView implements OnInit {
  private router = inject(Router);
  private analysisApi = inject(AnalysisApiService);
  private stateService = inject(DatasetStateService);
  private snackBar = inject(MatSnackBar);

  groupName = signal<string | null>(this.stateService.getSelectedGroup());
  analysisName = '';
  columns = signal<ConfigColumnInfo[]>([]);

  statisticalTypes = [
    { value: 'qualitativa_nominal', label: 'Qualitativa Nominal' },
    { value: 'qualitativa_ordinal', label: 'Qualitativa Ordinal' },
    { value: 'quantitativa_discreta', label: 'Quantitativa Discreta' },
    { value: 'quantitativa_continua', label: 'Quantitativa Contínua' },
    { value: 'categorica_temporal_ano', label: 'Temporal (Ano)' },
    { value: 'categorica_temporal_timestamp', label: 'Temporal (Timestamp)' },
  ];

  searchQuery = signal('');
  filteredColumns = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    if (!query) return this.columns();

    return this.columns().filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        (c.description && c.description.toLowerCase().includes(query))
    );
  });

  files = signal<FileInfo[]>([]);
  excelFiles = signal<string[]>([]);
  format = signal<string>('');

  selectedDictionary: string | null = null;
  dictionaryEntries: DictionaryEntry[] = [];

  isLoadingFiles = signal(false);
  isLoadingColumns = signal(false);
  isLoadingDictionary = signal(false);

  displayedColumns = ['select', 'name', 'type', 'statisticalType'];

  editingId: string | null = null;
  publishedArtifacts: AnalysisArtifact[] = [];

  private getDefaultStatisticalType(primitiveType: string): string {
    const type = (primitiveType || '').toLowerCase();
    if (
      type.includes('número') ||
      type.includes('numero') ||
      type.includes('num') ||
      type.includes('decimal') ||
      type.includes('inteiro') ||
      type.includes('float') ||
      type.includes('int') ||
      type.includes('double')
    ) {
      return 'quantitativa_discreta';
    }
    return 'qualitativa_nominal';
  }

  ngOnInit() {
    this.initialLoad();
    this.loadExcelFiles();
  }

  async initialLoad() {
    const current = this.stateService.currentAnalysis();
    const name = this.groupName() || current?.groupName;
    if (!name) return;

    if (current && (current.groupName === name || !this.groupName())) {
      this.editingId = current.id || null;
      this.publishedArtifacts = current.publishedArtifacts || [];
      this.analysisName = current.name || '';
      if (current.dictionary) {
        this.selectedDictionary = current.dictionary;
      }
    }

    this.isLoadingFiles.set(true);
    this.isLoadingColumns.set(true);
    try {
      const result = await this.analysisApi.analyzeGroup(name);
      this.format.set(result.format);

      const savedFiles = current?.files || [];
      this.files.set(
        result.files.map((f: string) => ({
          name: f,
          selected: current ? savedFiles.includes(f) : true,
        }))
      );

      const savedVarsMap = new Map((current?.variables || []).map((v: VariableSpec) => [v.name, v]));

      this.columns.set(
        result.common_columns.map((c: ColumnInfo) => {
          const savedVar = savedVarsMap.get(c.name);
          if (savedVar) {
            return {
              ...c,
              included: true,
              description: savedVar.description || undefined,
              statisticalType: savedVar.statisticalType || this.getDefaultStatisticalType(c.type),
            };
          }
          return {
            ...c,
            included: false,
            statisticalType: this.getDefaultStatisticalType(c.type),
          };
        })
      );

      if (this.selectedDictionary) {
        await this.onDictionaryChange();
      }
    } catch (err) {
      console.error('Falha ao carregar grupo:', err);
    } finally {
      this.isLoadingFiles.set(false);
      this.isLoadingColumns.set(false);
    }
  }

  async loadExcelFiles() {
    const name = this.groupName();
    if (!name) return;
    try {
      const files = await this.analysisApi.getExcelFiles(name);
      this.excelFiles.set(files);
    } catch (err) {
      console.error('Erro ao buscar arquivos Excel:', err);
    }
  }

  async onDictionaryChange() {
    const name = this.groupName();
    if (!name) return;

    if (!this.selectedDictionary) {
      this.dictionaryEntries = [];
      this.applyDescriptionsAndTypes();
      return;
    }

    this.isLoadingDictionary.set(true);
    try {
      this.dictionaryEntries = await this.analysisApi.parseDictionary(
        name,
        this.selectedDictionary
      );
      this.applyDescriptionsAndTypes();
    } catch (err) {
      console.error('Erro ao carregar dicionário:', err);
    } finally {
      this.isLoadingDictionary.set(false);
    }
  }

  applyDescriptionsAndTypes() {
    this.columns.update((cols) =>
      cols.map((col) => {
        const entry = this.dictionaryEntries.find(
          (e) => e.name.toLowerCase().trim() === col.name.toLowerCase().trim()
        );
        const newType = entry ? entry.var_type : col.type;
        return {
          ...col,
          description: entry ? entry.description : col.description,
          type: newType,
          statisticalType:
            entry && col.statisticalType === 'qualitativa_nominal'
              ? this.getDefaultStatisticalType(newType)
              : col.statisticalType,
        };
      })
    );
  }

  async updateColumns() {
    const name = this.groupName();
    const selectedFiles = this.files()
      .filter((f) => f.selected)
      .map((f) => f.name);

    if (!name || selectedFiles.length === 0) {
      this.columns.set([]);
      return;
    }

    this.isLoadingColumns.set(true);
    try {
      const detected = await this.analysisApi.getColumnsForFiles(name, selectedFiles);

      const currentCols = this.columns();
      const updatedCols = detected.map((c) => {
        const prev = currentCols.find((p) => p.name === c.name);
        const dictEntry = this.dictionaryEntries.find(
          (e) => e.name.toLowerCase().trim() === c.name.toLowerCase().trim()
        );

        const newType = dictEntry ? dictEntry.var_type : c.type;
        return {
          ...c,
          included: prev?.included ?? false,
          description: dictEntry ? dictEntry.description : prev?.description,
          type: newType,
          statisticalType: prev?.statisticalType || this.getDefaultStatisticalType(newType),
        };
      });

      this.columns.set(updatedCols);
    } catch (err) {
      console.error('Erro ao atualizar colunas:', err);
    } finally {
      this.isLoadingColumns.set(false);
    }
  }

  toggleFile(file: FileInfo, selected: boolean) {
    this.files.update((fs) => (fs.map((f) => (f.name === file.name ? { ...f, selected } : f))));
    this.updateColumns();
  }

  toggleAllFiles(selected: boolean) {
    this.files.update((fs) => fs.map((f) => ({ ...f, selected })));
    this.updateColumns();
  }

  isAllFilesSelected() {
    return this.files().length > 0 && this.files().every((f) => f.selected);
  }

  isSomeFilesSelected() {
    return this.files().some((f) => f.selected) && !this.isAllFilesSelected();
  }

  selectedFilesCount() {
    return this.files().filter((f) => f.selected).length;
  }

  isAllSelected() {
    return this.columns().length > 0 && this.columns().every((c) => c.included);
  }

  toggleAll() {
    const target = !this.isAllSelected();
    this.columns.update((cols) =>
      cols.map((c) => {
        let statType = c.statisticalType;
        if (target && (!statType || statType === 'qualitativa_nominal')) {
          statType = this.getDefaultStatisticalType(c.type);
        }
        return { ...c, included: target, statisticalType: statType };
      })
    );
  }

  toggleRow(row: ConfigColumnInfo) {
    this.columns.update((cols) =>
      cols.map((c) => {
        if (c.name === row.name) {
          const included = !c.included;
          let statType = c.statisticalType;
          if (included && (!statType || statType === 'qualitativa_nominal')) {
            statType = this.getDefaultStatisticalType(c.type);
          }
          return { ...c, included, statisticalType: statType };
        }
        return c;
      })
    );
  }

  selectedCount() {
    return this.columns().filter((c) => c.included).length;
  }

  async saveConfig() {
    if (!this.analysisName.trim()) {
      this.snackBar.open('Dê um nome para sua análise.', 'OK', { duration: 3000 });
      return;
    }

    const config: AnalysisConfig = {
      id: this.editingId || undefined,
      name: this.analysisName,
      groupName: this.groupName() || 'unknown',
      files: this.files()
        .filter((f) => f.selected)
        .map((f) => f.name),
      dictionary: this.selectedDictionary,
      variables: this.columns()
        .filter((c) => c.included)
        .map((v) => ({
          name: v.name,
          type: v.type,
          description: v.description,
          statisticalType: v.statisticalType,
        })),
      publishedArtifacts: this.publishedArtifacts,
    };

    await this.stateService.saveAnalysis(config);
    this.router.navigate(['/desktop/analysis/descritiva']);
  }

  goBack() {
    this.router.navigate(['/desktop/analysis/select']);
  }
}
