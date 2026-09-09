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
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AnalysisApiService, DatasetStateService } from '../../../../../services';
import { AnalysisConfig, VariableSpec } from '../../../../../models';

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
  `,
})
export class ConfirmDialog {
  constructor(
    public dialogRef: MatDialogRef<ConfirmDialog>,
    @Inject(MAT_DIALOG_DATA) public data: { title?: string; message: string }
  ) {}
  onConfirm() {
    this.dialogRef.close(true);
  }
  onCancel() {
    this.dialogRef.close(false);
  }
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
      <p style="font-size: 0.9rem; color: #666;">
        Exibindo as primeiras {{ data.sample.length }} linhas do arquivo consolidado.
      </p>
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
  `,
})
export class SampleDialog {
  constructor(
    public dialogRef: MatDialogRef<SampleDialog>,
    @Inject(MAT_DIALOG_DATA) public data: { columnName: string; sample: string[] }
  ) {}
}

import { AutoTooltipDirective } from '../../../../../directives';

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
    AutoTooltipDirective,
  ],
  templateUrl: './descritiva-view.html',
  styleUrl: './descritiva-view.css',
})
export class DescritivaView implements OnInit {
  stateService = inject(DatasetStateService);
  private analysisApi = inject(AnalysisApiService);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);

  config = this.stateService.currentAnalysis;
  searchQuery = signal('');
  filteredVariables = computed(() => {
    const vars = this.config()?.variables || [];
    const query = this.searchQuery().toLowerCase().trim();
    if (!query) return vars;
    return vars.filter(
      (v) =>
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
    const res = await firstValueFrom(
      this.dialog
        .open(ConfirmDialog, {
          data: {
            title: 'Confirmar exclusão',
            message: 'Tem certeza que deseja excluir esta configuração?',
          },
        })
        .afterClosed()
    );
    if (res) {
      await this.stateService.deleteAnalysis(id);
      this.snackBar.open('Análise excluída', 'Fechar', { duration: 3000 });
    }
  }

  async publishAnalysis(event: Event, id: string) {
    event.stopPropagation();
    const ok = await firstValueFrom(
      this.dialog
        .open(ConfirmDialog, {
          data: {
            title: 'Contribuir',
            message: 'Enviar esta análise para o repositório de produção?',
          },
        })
        .afterClosed()
    );
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
      this.snackBar.open('Falha ao publicar: ' + (err?.toString() || err), 'Fechar', {
        duration: 6000,
      });
    }
  }

  async syncWithSite() {
    const ok = await firstValueFrom(
      this.dialog
        .open(ConfirmDialog, {
          data: {
            title: 'Sincronizar com Site',
            message:
              'Deseja sincronizar todas as suas análises locais com o repositório do site? Isso criará um Pull Request com o histórico completo.',
          },
        })
        .afterClosed()
    );

    if (!ok) return;

    try {
      const result = await this.stateService.syncAnalysesWithSite();
      if (result && result.startsWith('http')) {
        const snack = this.snackBar.open('Pull request de sincronização criado', 'Abrir', {
          duration: 10000,
        });
        snack.onAction().subscribe(() => window.open(result, '_blank'));
      } else {
        this.snackBar.open('Sincronização enviada', 'Fechar', { duration: 4000 });
      }
    } catch (err: any) {
      this.snackBar.open('Falha na sincronização: ' + (err?.toString() || err), 'Fechar', {
        duration: 6000,
      });
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
      const result = await this.analysisApi.runEtl(
        analysisConfig.groupName,
        analysisConfig.files,
        analysisConfig.variables.map((v) => v.name)
      );

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
      const sample = await this.analysisApi.getVariableSample(path, variableName, 10);

      this.dialog.open(SampleDialog, {
        data: { columnName: variableName, sample },
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
      qualitativa_nominal: 'Qualitativa Nominal',
      qualitativa_ordinal: 'Qualitativa Ordinal',
      quantitativa_discreta: 'Quantitativa Discreta',
      quantitativa_continua: 'Quantitativa Contínua',
      categorica_temporal_ano: 'Temporal (Ano)',
      categorica_temporal_timestamp: 'Temporal (Timestamp)',
    };
    return types[typeValue] || typeValue;
  }
}
