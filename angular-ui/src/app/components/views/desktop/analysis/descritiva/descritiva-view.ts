import { Component, inject, signal, OnInit, Inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDividerModule } from '@angular/material/divider';
import { MatListModule } from '@angular/material/list';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { firstValueFrom } from 'rxjs';
import { DatasetStateService, AnalysisConfig } from '../../../../../services/dataset-state.service';
import { Router } from '@angular/router';
import { invoke } from '@tauri-apps/api/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'confirm-dialog',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule],
  template: `
    <div style="padding:24px; max-width:420px;">
      <h3 style="margin-top:0">{{ data.title || 'Confirmar' }}</h3>
      <p>{{ data.message }}</p>
      <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:16px;">
        <button mat-button (click)="onCancel()">Cancelar</button>
        <button mat-flat-button color="primary" (click)="onConfirm()">Confirmar</button>
      </div>
    </div>
  `
})
export class ConfirmDialog {
  constructor(public dialogRef: MatDialogRef<ConfirmDialog>, @Inject(MAT_DIALOG_DATA) public data: any) {}
  onConfirm() { this.dialogRef.close(true); }
  onCancel() { this.dialogRef.close(false); }
}

@Component({
  selector: 'sample-dialog',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, MatListModule, MatDividerModule],
  template: `
    <div style="padding:24px; min-width:350px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <h3 style="margin:0">Amostra: {{ data.columnName }}</h3>
        <button mat-icon-button (click)="dialogRef.close()">
          <mat-icon>close</mat-icon>
        </button>
      </div>
      <p style="font-size: 0.9rem; color: #666;">Exibindo as primeiras {{ data.sample.length }} linhas do arquivo consolidado.</p>
      <mat-divider></mat-divider>
      <div style="max-height: 400px; overflow-y: auto; margin: 16px 0;">
        <mat-list dense>
          @for (item of data.sample; track $index) {
            <mat-list-item>
              <mat-icon matListItemIcon>data_object</mat-icon>
              <span matListItemTitle>{{ item }}</span>
            </mat-list-item>
            <mat-divider></mat-divider>
          }
        </mat-list>
      </div>
      <div style="display:flex; justify-content:flex-end; margin-top:16px;">
        <button mat-flat-button color="primary" (click)="dialogRef.close()">Fechar</button>
      </div>
    </div>
  `
})
export class SampleDialog {
  constructor(public dialogRef: MatDialogRef<SampleDialog>, @Inject(MAT_DIALOG_DATA) public data: { columnName: string, sample: string[] }) {}
}

@Component({
  selector: 'app-descritiva-view',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatProgressBarModule,
    MatDividerModule,
    MatListModule,
    MatTooltipModule,
    MatDialogModule,
    MatSnackBarModule,
    MatFormFieldModule,
    MatInputModule,
    FormsModule,
  ],
  template: `
    <div class="container">
      <div class="header">
        <button mat-icon-button (click)="goBack()">
          <mat-icon>arrow_back</mat-icon>
        </button>
        <h1>Análises Descritivas</h1>
        <span class="spacer"></span>
        <button mat-stroked-button color="primary" (click)="syncWithSite()" matTooltip="Sincronizar todas as análises com o repositório GitHub">
          <mat-icon>sync</mat-icon> Sincronizar com Site
        </button>
      </div>

      <div class="content-grid">
        <!-- Left Panel: History -->
        <div class="left-panel">
          <mat-card appearance="outlined" class="history-card">
            <mat-card-header>
              <mat-card-title>Análises Anteriores</mat-card-title>
              <mat-card-subtitle>Histórico de configurações salvas</mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              <mat-nav-list class="history-list">
                @for (item of stateService.allAnalyses(); track item.id) {
                  <mat-list-item [class.selected]="config()?.id === item.id" (click)="selectAnalysis(item)">
                    <mat-icon matListItemIcon>history</mat-icon>
                    <span matListItemTitle>{{ item.name }}</span>
                    <span matListItemLine>{{ item.groupName }} • {{ item.variables.length }} variáveis</span>
                    <button mat-icon-button matListItemMeta (click)="deleteAnalysis($event, item.id!)" matTooltip="Excluir">
                      <mat-icon color="warn">delete</mat-icon>
                    </button>
                    <button mat-icon-button matListItemMeta (click)="publishAnalysis($event, item.id!)" matTooltip="Contribuir">
                      <mat-icon>cloud_upload</mat-icon>
                    </button>
                  </mat-list-item>
                }
                @if (stateService.allAnalyses().length === 0) {
                  <p class="empty-history">Nenhuma análise anterior encontrada.</p>
                }
              </mat-nav-list>
            </mat-card-content>
          </mat-card>
        </div>

        <!-- Right Panel: Current Analysis & ETL -->
        <div class="right-panel">
          @if (config(); as analysisConfig) {
            <mat-card appearance="outlined" class="info-card">
              <mat-card-header>
                <div class="card-header-with-actions">
                  <div>
                    <mat-card-title>{{ analysisConfig.name }}</mat-card-title>
                    <mat-card-subtitle>
                      Grupo: <strong>{{ analysisConfig.groupName }}</strong> | 
                      Arquivos: <strong>{{ analysisConfig.files.length }}</strong>
                    </mat-card-subtitle>
                  </div>
                  <button mat-stroked-button (click)="editCurrent()">
                    <mat-icon>edit</mat-icon> Editar Configuração
                  </button>
                </div>
              </mat-card-header>
              <mat-card-content>
                <div class="etl-section">
                  <h3>Preparação dos Dados (ETL)</h3>
                  <p>Consolide os arquivos selecionados para habilitar as ferramentas de análise.</p>
                  
                  @if (etlStatus() === 'idle') {
                    <button mat-raised-button color="accent" (click)="startEtl()">
                      <mat-icon>merge_type</mat-icon>
                      Consolidar Base de Dados (ETL)
                    </button>
                  } @else if (etlStatus() === 'processing') {
                    <div class="status-box processing">
                      <mat-progress-bar mode="indeterminate"></mat-progress-bar>
                      <p>Processando via Polars...</p>
                    </div>
                  } @else if (etlStatus() === 'success') {
                    <div class="status-box success">
                      <mat-icon>check_circle</mat-icon>
                      <div class="success-info">
                        <p><strong>Base consolidada com sucesso!</strong></p>
                        <div class="path-display">
                          <mat-icon>folder_open</mat-icon>
                          <span>Local do arquivo: <code>{{ processedFilePath() }}</code></span>
                        </div>
                      </div>
                    </div>
                  } @else if (etlStatus() === 'error') {
                    <div class="status-box error">
                      <mat-icon>error</mat-icon>
                      <p>Erro: {{ etlError() }}</p>
                      <button mat-button (click)="startEtl()">Tentar Novamente</button>
                    </div>
                  }
                </div>

                <mat-divider></mat-divider>

                @if (analysisConfig.publishedArtifacts && analysisConfig.publishedArtifacts.length > 0) {
                  <div class="artifacts-section">
                    <h3>Publicações desta Análise ({{ analysisConfig.publishedArtifacts.length }}):</h3>
                    <div class="artifact-grid">
                      @for (art of analysisConfig.publishedArtifacts; track art.id) {
                        <mat-card appearance="outlined" class="artifact-item-card" (click)="goToArtifact(analysisConfig.id!, art.id)" [matTooltip]="art.label" [title]="art.label">
                          <mat-card-content>
                            <mat-icon>{{ art.type === 'barchart' ? 'bar_chart' : 'description' }}</mat-icon>
                            <div class="art-info">
                              <span class="art-label" [title]="art.label">{{ art.label }}</span>
                              <span class="art-date">{{ art.createdAt | date:'short' }}</span>
                            </div>
                          </mat-card-content>
                        </mat-card>
                      }
                    </div>
                  </div>
                  <mat-divider></mat-divider>
                }

                <div class="variable-summary">
                  <div class="variable-header">
                    <h3>Variáveis Selecionadas ({{ analysisConfig.variables.length }}):</h3>
                    <mat-form-field appearance="outline" class="search-field" subscriptSizing="dynamic">
                      <mat-icon matPrefix>search</mat-icon>
                      <mat-label>Filtrar variáveis...</mat-label>
                      <input matInput [ngModel]="searchQuery()" (ngModelChange)="searchQuery.set($event)" placeholder="Nome ou descrição" />
                      <button *ngIf="searchQuery()" matSuffix mat-icon-button (click)="searchQuery.set('')">
                        <mat-icon>close</mat-icon>
                      </button>
                    </mat-form-field>
                  </div>

                  <table mat-table [dataSource]="filteredVariables()" class="compact-table">
                    <ng-container matColumnDef="name">
                      <th mat-header-cell *matHeaderCellDef>Nome</th>
                      <td mat-cell *matCellDef="let variable">
                        <div class="var-name">{{ variable.name }}</div>
                        <div class="var-desc" *ngIf="variable.description">{{ variable.description }}</div>
                      </td>
                    </ng-container>
                    <ng-container matColumnDef="type">
                      <th mat-header-cell *matHeaderCellDef>Classificação</th>
                      <td mat-cell *matCellDef="let variable">
                        <div class="type-container">
                          <span class="type-badge" [class.number]="variable.type === 'Número'">{{ variable.type }}</span>
                          <span class="stat-type-label" *ngIf="variable.statisticalType">
                            {{ getStatisticalTypeLabel(variable.statisticalType) }}
                          </span>
                        </div>
                      </td>
                    </ng-container>
                    <ng-container matColumnDef="actions">
                      <th mat-header-cell *matHeaderCellDef></th>
                      <td mat-cell *matCellDef="let variable">
                        @if (etlStatus() === 'success') {
                          <button mat-button color="primary" (click)="viewSample(variable.name)">
                            <mat-icon>visibility</mat-icon> ver amostra
                          </button>
                        }
                      </td>
                    </ng-container>
                    <tr mat-header-row *matHeaderRowDef="['name', 'type', 'actions']"></tr>
                    <tr mat-row *matRowDef="let row; columns: ['name', 'type', 'actions'];"></tr>
                  </table>
                </div>
              </mat-card-content>
            </mat-card>

            @if (etlStatus() === 'success') {
              <div class="analysis-placeholder active">
                <mat-icon>assessment</mat-icon>
                <h2>Análises Disponíveis</h2>
                <div class="analysis-actions">
                  <button mat-flat-button color="primary">Frequências</button>
                  <button mat-flat-button color="primary">Medidas de Tendência</button>
                  <button mat-flat-button color="primary" (click)="goToBarChart()">
                    <mat-icon>bar_chart</mat-icon> Gráficos de Barras
                  </button>
                  <button mat-flat-button color="primary">Cruzamentos</button>
                </div>
              </div>
            } @else {
              <div class="analysis-placeholder">
                <mat-icon>lock</mat-icon>
                <h2>Aguardando ETL</h2>
                <p>O processo de ETL é necessário para normalizar os dados antes da análise.</p>
              </div>
            }
          } @else {
            <div class="empty-state">
              <mat-icon color="warn">warning</mat-icon>
              <h2>Nenhuma configuração selecionada</h2>
              <p>Selecione uma análise no histórico ou crie uma nova.</p>
              <button mat-raised-button color="primary" (click)="goBack()">
                Criar Nova Configuração
              </button>
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    .container { padding: 24px; max-width: 1400px; margin: 0 auto; }
    .header { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; }
    .header h1 { margin: 0; color: #3f51b5; }
    .spacer { flex: 1 1 auto; }

    .content-grid { display: grid; grid-template-columns: 350px 1fr; gap: 24px; align-items: start; }
    
    .history-list { background: #fff; }
    .history-list .selected { background: rgba(63, 81, 181, 0.08); border-left: 4px solid #3f51b5; }
    .empty-history { padding: 16px; text-align: center; color: #999; font-style: italic; font-size: 0.9rem; }

    .card-header-with-actions { display: flex; justify-content: space-between; align-items: flex-start; width: 100%; }

    .info-card { margin-bottom: 24px; }
    .variable-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; gap: 16px; }
    .search-field { flex: 1; max-width: 350px; }
    .compact-table { width: 100%; margin-top: 8px; }
    .var-name { font-weight: 500; }
    .var-desc { font-size: 0.75rem; color: #777; font-style: italic; }
    .type-badge { font-size: 0.7rem; padding: 2px 6px; background: #f0f0f0; border-radius: 4px; }
    .type-badge.number { background: #e3f2fd; color: #1976d2; }
    .type-container { display: flex; flex-direction: column; gap: 4px; }
    .stat-type-label { font-size: 0.75rem; color: #3f51b5; font-weight: 500; }

    .etl-section { padding: 8px 0 16px 0; }
    .status-box { display: flex; align-items: center; gap: 16px; padding: 12px; border-radius: 8px; margin-top: 8px; }
    .status-box.processing { background: #e3f2fd; }
    .status-box.success { background: #e8f5e9; color: #2e7d32; }
    .status-box.error { background: #ffebee; color: #c62828; }
    .success-info p { margin: 0; }
    .path-display { display: flex; align-items: center; gap: 8px; margin-top: 4px; font-size: 0.85rem; color: #555; }
    .path-display code { background: rgba(0,0,0,0.05); padding: 2px 4px; border-radius: 4px; word-break: break-all; }

    .artifacts-section { padding: 8px 0 16px 0; }
    .artifact-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; margin-top: 12px; }
    .artifact-item-card { cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; background: #fff; }
    .artifact-item-card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.1); border-color: #3f51b5; }
    .artifact-item-card mat-card-content { display: flex; align-items: center; gap: 12px; padding: 12px !important; }
    .artifact-item-card mat-icon { color: #3f51b5; }
    .art-info { display: flex; flex-direction: column; }
    .art-label { font-weight: 500; font-size: 0.9rem; color: #333; }
    .art-date { font-size: 0.7rem; color: #999; }

    .analysis-placeholder { text-align: center; padding: 40px; background: #fafafa; border-radius: 8px; border: 2px dashed #ddd; }
    .analysis-placeholder.active { opacity: 1; background: #fff; border-style: solid; border-color: #3f51b5; }
    .analysis-placeholder mat-icon { font-size: 48px; width: 48px; height: 48px; color: #ccc; margin-bottom: 8px; }
    .analysis-placeholder.active mat-icon { color: #3f51b5; }
    .analysis-actions { display: flex; justify-content: center; gap: 12px; margin-top: 16px; }

    .empty-state { text-align: center; padding: 60px; background: #f5f5f5; border-radius: 8px; }
    
    @media (max-width: 900px) { .content-grid { grid-template-columns: 1fr; } }
  `]
})
export class DescritivaView implements OnInit {
  stateService = inject(DatasetStateService);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);

  config = this.stateService.currentAnalysis;
  searchQuery = signal('');
  filteredVariables = computed(() => {
    const vars = this.config()?.variables || [];
    const query = this.searchQuery().toLowerCase().trim();
    if (!query) return vars;
    return vars.filter(v => 
      v.name.toLowerCase().includes(query) || 
      (v.description && v.description.toLowerCase().includes(query))
    );
  });
  
  etlStatus = signal<'idle' | 'processing' | 'success' | 'error'>('idle');
  etlError = signal<string | null>(null);
  processedFilePath = signal<string | null>(null);

  ngOnInit() {
    // History is loaded by the service constructor
  }

  selectAnalysis(analysis: AnalysisConfig) {
    this.stateService.setCurrentAnalysis(analysis);
    this.etlStatus.set('idle');
    this.processedFilePath.set(null);
  }

  async deleteAnalysis(event: Event, id: string) {
    event.stopPropagation();
    const res = await firstValueFrom(this.dialog.open(ConfirmDialog, { data: { title: 'Confirmar exclusão', message: 'Tem certeza que deseja excluir esta configuração?' } }).afterClosed());
    if (res) {
      await this.stateService.deleteAnalysis(id);
      this.snackBar.open('Análise excluída', 'Fechar', { duration: 3000 });
    }
  }

  async publishAnalysis(event: Event, id: string) {
    event.stopPropagation();
    const ok = await firstValueFrom(this.dialog.open(ConfirmDialog, { data: { title: 'Contribuir', message: 'Enviar esta análise para o repositório de produção?' } }).afterClosed());
    if (!ok) return;
    try {
      const result = await this.stateService.publishAnalysis(id);
      if (result && result.startsWith('http')) {
        const snack = this.snackBar.open('Pull request criado', 'Abrir', { duration: 10000 });
        snack.onAction().subscribe(() => window.open(result, '_blank'));
      } else {
        this.snackBar.open('Publicação enviada', 'Fechar', { duration: 4000 });
      }
    } catch (err: any) {
      this.snackBar.open('Falha ao publicar: ' + (err?.toString() || err), 'Fechar', { duration: 6000 });
    }
  }

  async syncWithSite() {
    const ok = await firstValueFrom(this.dialog.open(ConfirmDialog, { 
      data: { 
        title: 'Sincronizar com Site', 
        message: 'Deseja sincronizar todas as suas análises locais com o repositório do site? Isso criará um Pull Request com o histórico completo.' 
      } 
    }).afterClosed());
    
    if (!ok) return;
    
    try {
      const result = await this.stateService.syncAnalysesWithSite();
      if (result && result.startsWith('http')) {
        const snack = this.snackBar.open('Pull request de sincronização criado', 'Abrir', { duration: 10000 });
        snack.onAction().subscribe(() => window.open(result, '_blank'));
      } else {
        this.snackBar.open('Sincronização enviada', 'Fechar', { duration: 4000 });
      }
    } catch (err: any) {
      this.snackBar.open('Falha na sincronização: ' + (err?.toString() || err), 'Fechar', { duration: 6000 });
    }
  }

  editCurrent() {
    const current = this.config();
    if (current?.groupName) {
      this.stateService.setSelectedGroup(current.groupName);
    }
    this.router.navigate(['/desktop/analysis/config']);
  }

  goToBarChart() {
    this.router.navigate(['/desktop/analysis/descritiva/barchart']);
  }

  goToArtifact(analysisId: string, artifactId: string) {
    this.router.navigate(['/published', analysisId, artifactId]);
  }

  async startEtl() {
    const analysisConfig = this.config();
    if (!analysisConfig) return;

    this.etlStatus.set('processing');
    this.etlError.set(null);

    try {
      const result = await invoke<string>('run_etl', {
        groupName: analysisConfig.groupName,
        files: analysisConfig.files,
        columns: analysisConfig.variables.map(v => v.name)
      });
      
      this.processedFilePath.set(result);
      this.etlStatus.set('success');
    } catch (err: any) {
      this.etlStatus.set('error');
      this.etlError.set(err.toString());
    }
  }

  async viewSample(variableName: string) {
    const path = this.processedFilePath();
    if (!path) {
      this.snackBar.open('Consolide os dados primeiro', 'Fechar', { duration: 3000 });
      return;
    }

    try {
      const sample = await invoke<string[]>('get_variable_sample', {
        filePath: path,
        columnName: variableName,
        limit: 10
      });
      
      this.dialog.open(SampleDialog, {
        data: { columnName: variableName, sample }
      });
    } catch (err: any) {
      this.snackBar.open('Erro ao carregar amostra: ' + err, 'Fechar', { duration: 5000 });
    }
  }

  goBack() {
    this.router.navigate(['/desktop/analysis/config']);
  }

  getStatisticalTypeLabel(typeValue: string): string {
    const types: Record<string, string> = {
      'qualitativa_nominal': 'Qualitativa Nominal',
      'qualitativa_ordinal': 'Qualitativa Ordinal',
      'quantitativa_discreta': 'Quantitativa Discreta',
      'quantitativa_continua': 'Quantitativa Contínua',
      'categorica_temporal_ano': 'Temporal (Ano)',
      'categorica_temporal_timestamp': 'Temporal (Timestamp)',
    };
    return types[typeValue] || typeValue;
  }
}
