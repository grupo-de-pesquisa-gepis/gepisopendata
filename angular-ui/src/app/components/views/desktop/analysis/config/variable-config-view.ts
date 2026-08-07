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
import { invoke } from '@tauri-apps/api/core';
import { Router } from '@angular/router';
import { DatasetStateService } from '../../../../../services/dataset-state.service';
import { FormsModule } from '@angular/forms';

interface ColumnInfo {
  name: string;
  type: string;
  included?: boolean;
  description?: string;
  statisticalType?: string;
}

interface FileInfo {
  name: string;
  selected: boolean;
}

interface DictionaryEntry {
  name: string;
  description: string;
  var_type: string;
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
  ],
  template: `
    <div class="container">
      <div class="header">
        <button mat-icon-button (click)="goBack()">
          <mat-icon>arrow_back</mat-icon>
        </button>
        <h1>Configurar Variáveis: {{ groupName() }}</h1>
      </div>

      <div class="content-grid">
        <div class="left-panel">
          <mat-card appearance="outlined" class="config-meta-card">
            <mat-card-header>
              <mat-card-title>Nome da Análise</mat-card-title>
              <mat-card-subtitle>Identifique esta configuração para uso futuro</mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Nome da Análise</mat-label>
                <input matInput [(ngModel)]="analysisName" placeholder="Ex: Análise de Saúde - Set/2024" />
              </mat-form-field>
            </mat-card-content>
          </mat-card>

          <mat-card appearance="outlined" class="files-card">
            <mat-card-header>
              <mat-card-title>Arquivos Encontrados ({{ files().length }})</mat-card-title>
              <mat-card-subtitle>
                Tipo de dado: <strong class="format-badge">{{ format() | uppercase }}</strong>
              </mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              <div class="file-list">
                @if (isLoadingFiles()) {
                  <mat-progress-bar mode="indeterminate"></mat-progress-bar>
                } @else {
                  <div class="file-list-actions">
                    <mat-checkbox (change)="toggleAllFiles($event.checked)" 
                                  [checked]="isAllFilesSelected()"
                                  [indeterminate]="isSomeFilesSelected()">
                      Selecionar Todos
                    </mat-checkbox>
                  </div>
                  @for (file of files(); track file.name) {
                    <div class="file-item">
                      <mat-checkbox [checked]="file.selected" 
                                   (change)="toggleFile(file, $event.checked)">
                      </mat-checkbox>
                      <mat-icon>insert_drive_file</mat-icon>
                      <span class="file-name" [title]="file.name">{{ file.name }}</span>
                    </div>
                  }
                }
              </div>
            </mat-card-content>
          </mat-card>

          <mat-card appearance="outlined" class="dictionary-card">
            <mat-card-header>
              <mat-card-title>Dicionário de Dados</mat-card-title>
              <mat-card-subtitle>Descrições e tipos oficiais</mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Arquivo de Dicionário</mat-label>
                <mat-select [(ngModel)]="selectedDictionary" (selectionChange)="onDictionaryChange()">
                  <mat-option [value]="null">Nenhum</mat-option>
                  @for (dict of excelFiles(); track $index) {
                    <mat-option [value]="dict">{{ dict }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              @if (isLoadingDictionary()) {
                <mat-progress-bar mode="indeterminate"></mat-progress-bar>
              }
            </mat-card-content>
          </mat-card>
        </div>

        <mat-card appearance="outlined" class="columns-card">
          <mat-card-header>
            <mat-card-title>Variáveis Identificadas</mat-card-title>
            <mat-card-subtitle>
              @if (selectedFilesCount() === 0) {
                Selecione arquivos para ver colunas.
              } @else {
                Presentes em {{ selectedFilesCount() }} arquivo(s).
                <div class="header-info">
                  <mat-icon>info</mat-icon>
                  <span>Considerando a <strong>primeira linha</strong> como cabeçalho</span>
                </div>
              }
            </mat-card-subtitle>
          </mat-card-header>

          <mat-card-content>
            <div class="table-actions-top" *ngIf="columns().length > 0">
              <div class="selection-info">
                <strong>{{ selectedCount() }}</strong> selecionadas
              </div>
              
              <mat-form-field appearance="outline" class="search-field" subscriptSizing="dynamic">
                <mat-icon matPrefix>search</mat-icon>
                <mat-label>Filtrar variáveis...</mat-label>
                <input matInput [ngModel]="searchQuery()" (ngModelChange)="searchQuery.set($event)" placeholder="Nome ou descrição" />
                <button *ngIf="searchQuery()" matSuffix mat-icon-button (click)="searchQuery.set('')">
                  <mat-icon>close</mat-icon>
                </button>
              </mat-form-field>

              <button mat-raised-button color="primary" [disabled]="selectedCount() === 0" (click)="saveConfig()">
                Salvar e Ir para Análises
                <mat-icon>assessment</mat-icon>
              </button>
            </div>

            @if (isLoadingColumns()) {
              <div class="loading-state">
                <mat-progress-bar mode="query"></mat-progress-bar>
              </div>
            } @else {
              <table mat-table [dataSource]="filteredColumns()" class="full-width-table">
                <ng-container matColumnDef="select">
                  <th mat-header-cell *matHeaderCellDef>
                    <mat-checkbox (change)="$event ? toggleAll() : null"
                                  [checked]="isAllSelected()">
                    </mat-checkbox>
                  </th>
                  <td mat-cell *matCellDef="let row">
                    <mat-checkbox (change)="$event ? toggleRow(row) : null"
                                  [checked]="row.included">
                    </mat-checkbox>
                  </td>
                </ng-container>

                <ng-container matColumnDef="name">
                  <th mat-header-cell *matHeaderCellDef>Nome</th>
                  <td mat-cell *matCellDef="let row">
                    <div class="var-name-cell">
                      <span class="var-name">{{ row.name }}</span>
                      @if (row.description) {
                        <span class="var-description">{{ row.description }}</span>
                      }
                    </div>
                  </td>
                </ng-container>

                <ng-container matColumnDef="type">
                  <th mat-header-cell *matHeaderCellDef>Tipo Primitivo</th>
                  <td mat-cell *matCellDef="let row">
                    <span class="type-badge" [class.number]="row.type === 'Número'">{{ row.type }}</span>
                  </td>
                </ng-container>

                <ng-container matColumnDef="statisticalType">
                  <th mat-header-cell *matHeaderCellDef>Classificação Estatística</th>
                  <td mat-cell *matCellDef="let row">
                    <mat-form-field appearance="outline" subscriptSizing="dynamic" class="stat-type-select" *ngIf="row.included">
                      <mat-select [(ngModel)]="row.statisticalType">
                        @for (type of statisticalTypes; track type.value) {
                          <mat-option [value]="type.value">{{ type.label }}</mat-option>
                        }
                      </mat-select>
                    </mat-form-field>
                    <span class="type-placeholder" *ngIf="!row.included">-</span>
                  </td>
                </ng-container>

                <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
                <tr mat-row *matRowDef="let row; columns: displayedColumns;" [class.row-excluded]="!row.included"></tr>
              </table>
            }
          </mat-card-content>
        </mat-card>
      </div>
    </div>
  `,
  styles: [`
    .container { padding: 24px; max-width: 1400px; margin: 0 auto; }
    .header { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; }
    .header h1 { margin: 0; color: #3f51b5; }
    .content-grid { display: grid; grid-template-columns: 350px 1fr; gap: 24px; align-items: start; }
    .left-panel { display: flex; flex-direction: column; gap: 24px; }
    .full-width { width: 100%; }
    .file-list { max-height: 300px; overflow-y: auto; margin-top: 8px; display: flex; flex-direction: column; gap: 4px; }
    .file-item { display: flex; align-items: center; gap: 4px; padding: 4px 8px; background: #f9f9f9; border-radius: 4px; font-size: 0.85rem; }
    .file-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
    .table-actions-top { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: #f8f9fa; border-bottom: 1px solid #eee; margin-bottom: 8px; gap: 16px; }
    .search-field { flex: 1; max-width: 400px; }
    .search-field ::ng-deep .mat-mdc-text-field-wrapper { background-color: white !important; }
    .var-name-cell { display: flex; flex-direction: column; gap: 2px; padding: 4px 0; }
    .var-name { font-weight: 500; }
    .var-description { font-size: 0.75rem; color: #666; font-style: italic; }
    .full-width-table { width: 100%; }
    .type-badge { font-size: 0.75rem; padding: 2px 8px; background: #f0f0f0; border-radius: 4px; color: #666; }
    .type-badge.number { background: #e3f2fd; color: #1976d2; }
    .stat-type-select { width: 100%; min-width: 200px; font-size: 0.85rem; }
    .type-placeholder { color: #ccc; margin-left: 12px; }
    .row-excluded { opacity: 0.5; }
    .header-info { display: flex; align-items: center; gap: 6px; margin-top: 4px; font-size: 0.75rem; color: #888; }
    .header-info mat-icon { font-size: 14px; width: 14px; height: 14px; }
    @media (max-width: 900px) { .content-grid { grid-template-columns: 1fr; } }
  `]
})
export class VariableConfigView implements OnInit {
  private router = inject(Router);
  private stateService = inject(DatasetStateService);
  private snackBar = inject(MatSnackBar);
  
  groupName = signal<string | null>(this.stateService.getSelectedGroup());
  analysisName = '';
  columns = signal<ColumnInfo[]>([]);

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
    
    return this.columns().filter(c => 
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
  publishedArtifacts: any[] = [];

  private getDefaultStatisticalType(primitiveType: string): string {
    const type = (primitiveType || '').toLowerCase();
    // Broaden the check to include 'num' and other numeric indicators
    if (type.includes('número') || type.includes('numero') || type.includes('num') || 
        type.includes('decimal') || type.includes('inteiro') || type.includes('float') || 
        type.includes('int') || type.includes('double')) {
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
      const result = await invoke<any>('analyze_group', { groupName: name });
      this.format.set(result.format);
      
      const savedFiles = current?.files || [];
      this.files.set(result.files.map((f: string) => ({ 
        name: f, 
        selected: current ? savedFiles.includes(f) : true 
      })));

      const savedVarsMap = new Map((current?.variables || []).map((v: any) => [v.name, v]));

      this.columns.set(result.common_columns.map((c: any) => {
        const savedVar = savedVarsMap.get(c.name);
        if (savedVar) {
          return { 
            ...c, 
            included: true,
            description: savedVar.description || c.description,
            statisticalType: savedVar.statisticalType || this.getDefaultStatisticalType(c.type)
          };
        }
        return { 
          ...c, 
          included: false,
          statisticalType: this.getDefaultStatisticalType(c.type)
        };
      }));

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
      const files = await invoke<string[]>('get_excel_files', { groupName: name });
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
      this.dictionaryEntries = await invoke<DictionaryEntry[]>('parse_dictionary', { 
        groupName: name, 
        fileName: this.selectedDictionary 
      });
      this.applyDescriptionsAndTypes();
    } catch (err) {
      console.error('Erro ao carregar dicionário:', err);
    } finally {
      this.isLoadingDictionary.set(false);
    }
  }

  applyDescriptionsAndTypes() {
    this.columns.update(cols => cols.map(col => {
      const entry = this.dictionaryEntries.find(e => 
        e.name.toLowerCase().trim() === col.name.toLowerCase().trim()
      );
      const newType = entry ? entry.var_type : col.type;
      return {
        ...col,
        description: entry ? entry.description : col.description,
        type: newType,
        statisticalType: (entry && col.statisticalType === 'qualitativa_nominal') 
          ? this.getDefaultStatisticalType(newType)
          : col.statisticalType
      };
    }));
  }

  async updateColumns() {
    const name = this.groupName();
    const selectedFiles = this.files().filter(f => f.selected).map(f => f.name);
    
    if (!name || selectedFiles.length === 0) {
      this.columns.set([]);
      return;
    }

    this.isLoadingColumns.set(true);
    try {
      const detected = await invoke<ColumnInfo[]>('get_columns_for_files', { 
        groupName: name, 
        files: selectedFiles 
      });
      
      const currentCols = this.columns();
      const updatedCols = detected.map(c => {
        const prev = currentCols.find(p => p.name === c.name);
        const dictEntry = this.dictionaryEntries.find(e => 
          e.name.toLowerCase().trim() === c.name.toLowerCase().trim()
        );

        const newType = dictEntry ? dictEntry.var_type : c.type;
        return {
          ...c,
          included: prev?.included ?? false,
          description: dictEntry ? dictEntry.description : prev?.description,
          type: newType,
          statisticalType: prev?.statisticalType || this.getDefaultStatisticalType(newType)
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
    this.files.update(fs => fs.map(f => f.name === file.name ? { ...f, selected } : f));
    this.updateColumns();
  }

  toggleAllFiles(selected: boolean) {
    this.files.update(fs => fs.map(f => ({ ...f, selected })));
    this.updateColumns();
  }

  isAllFilesSelected() { return this.files().length > 0 && this.files().every(f => f.selected); }
  isSomeFilesSelected() { return this.files().some(f => f.selected) && !this.isAllFilesSelected(); }
  selectedFilesCount() { return this.files().filter(f => f.selected).length; }
  isAllSelected() { return this.columns().length > 0 && this.columns().every(c => c.included); }

  toggleAll() {
    const target = !this.isAllSelected();
    console.log(`[VariableConfig] Toggling ALL variables to included: ${target}`);
    this.columns.update(cols => cols.map(c => {
      let statType = c.statisticalType;
      if (target && (!statType || statType === 'qualitativa_nominal')) {
        statType = this.getDefaultStatisticalType(c.type);
        console.log(`[VariableConfig] Auto-assigned type for '${c.name}': Primitive='${c.type}' -> Statistical='${statType}'`);
      }
      return { ...c, included: target, statisticalType: statType };
    }));
  }

  toggleRow(row: ColumnInfo) {
    this.columns.update(cols => cols.map(c => {
      if (c.name === row.name) {
        const included = !c.included;
        let statType = c.statisticalType;
        if (included && (!statType || statType === 'qualitativa_nominal')) {
          statType = this.getDefaultStatisticalType(c.type);
          console.log(`[VariableConfig] Toggled '${c.name}'. Auto-assigned: Primitive='${c.type}' -> Statistical='${statType}'`);
        } else {
           console.log(`[VariableConfig] Toggled '${c.name}'. Included: ${included}, Current Statistical Type: '${statType}'`);
        }
        return { ...c, included, statisticalType: statType };
      }
      return c;
    }));
  }

  selectedCount() { return this.columns().filter(c => c.included).length; }

  async saveConfig() {
    if (!this.analysisName.trim()) {
      this.snackBar.open('Dê um nome para sua análise.', 'OK', { duration: 3000 });
      return;
    }

    const config = {
      id: this.editingId || undefined,
      name: this.analysisName,
      groupName: this.groupName() || 'unknown',
      files: this.files().filter(f => f.selected).map(f => f.name),
      dictionary: this.selectedDictionary,
      variables: this.columns().filter(c => c.included).map(v => ({
        name: v.name,
        type: v.type,
        description: v.description,
        statisticalType: v.statisticalType
      })),
      publishedArtifacts: this.publishedArtifacts
    };
    
    await this.stateService.saveAnalysis(config);
    this.router.navigate(['/desktop/analysis/descritiva']);
  }

  goBack() { this.router.navigate(['/desktop/analysis/select']); }
}
