import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Router } from '@angular/router';

import { IbgeCnefeApiService } from '../../../../../../services';
import {
  IbgeCnefeOverview,
  IbgeCnefeUfStatus,
  IbgeCnefeDownloadRequest,
} from '../../../../../../models';
import { AutoTooltipDirective } from '../../../../../../directives';

@Component({
  selector: 'app-cnefe-lat-lgt-view',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatChipsModule,
    MatTooltipModule,
    MatExpansionModule,
    MatSnackBarModule,
    AutoTooltipDirective,
  ],
  templateUrl: './cnefe-lat-lgt-view.html',
  styleUrl: './cnefe-lat-lgt-view.css',
})
export class CnefeLatLgtView implements OnInit {
  private cnefeApi = inject(IbgeCnefeApiService);
  private router = inject(Router);
  private snackBar = inject(MatSnackBar);

  overview = signal<IbgeCnefeOverview | null>(null);
  isLoading = signal(true);
  isBatchDownloading = signal(false);
  activeOperations = signal<Record<string, boolean>>({});

  extractZip = signal(true);
  searchQuery = signal('');
  selectedRegion = signal<string>('all');
  selectedStatusFilter = signal<'all' | 'downloaded' | 'extracted' | 'pending'>('all');

  downloadProgress = this.cnefeApi.downloadProgress;

  totalUfs = computed(() => this.overview()?.ufs?.length ?? 27);
  downloadedCount = computed(() => this.overview()?.totalZipCount ?? 0);
  extractedCount = computed(() => this.overview()?.totalExtractedCount ?? 0);
  totalSizeFormatted = computed(() =>
    this.formatBytes(this.overview()?.totalSizeBytes ?? 0)
  );

  regions = ['all', 'Norte', 'Nordeste', 'Sudeste', 'Sul', 'Centro-Oeste'];

  filteredUfs = computed(() => {
    const list = this.overview()?.ufs ?? [];
    const q = this.searchQuery().toLowerCase().trim();
    const reg = this.selectedRegion();
    const status = this.selectedStatusFilter();

    return list.filter((uf) => {
      // Search match
      const matchesSearch =
        !q ||
        uf.name.toLowerCase().includes(q) ||
        uf.sigla.toLowerCase().includes(q) ||
        uf.code.includes(q) ||
        uf.packageName.toLowerCase().includes(q);

      // Region match
      const matchesRegion = reg === 'all' || uf.region === reg;

      // Status match
      let matchesStatus = true;
      if (status === 'downloaded') {
        matchesStatus = uf.zipExists || uf.csvExists;
      } else if (status === 'extracted') {
        matchesStatus = uf.isExtracted && uf.csvExists;
      } else if (status === 'pending') {
        matchesStatus = !uf.zipExists && !uf.csvExists;
      }

      return matchesSearch && matchesRegion && matchesStatus;
    });
  });

  ngOnInit(): void {
    this.loadStatus();
  }

  async loadStatus(): Promise<void> {
    this.isLoading.set(true);
    try {
      const data = await this.cnefeApi.getStatus();
      this.overview.set(data);
    } catch (err: any) {
      console.error('Erro ao carregar status do CNEFE IBGE:', err);
      this.snackBar.open(
        'Erro ao verificar status do CNEFE: ' + (err?.message || err),
        'Fechar',
        { duration: 4000 }
      );
    } finally {
      this.isLoading.set(false);
    }
  }

  isOperationActive(ufSigla: string): boolean {
    return !!this.activeOperations()[ufSigla.toUpperCase()];
  }

  async downloadUf(uf: IbgeCnefeUfStatus, force = false): Promise<void> {
    const sigla = uf.sigla.toUpperCase();
    this.activeOperations.update((map) => ({ ...map, [sigla]: true }));

    try {
      const req: IbgeCnefeDownloadRequest = {
        uf: sigla,
        extractZip: this.extractZip(),
        force,
      };
      await this.cnefeApi.downloadUf(req);
      this.snackBar.open(`CNEFE de ${uf.name} (${sigla}) baixado com sucesso!`, 'OK', {
        duration: 3000,
      });
      await this.loadStatus();
    } catch (err: any) {
      console.error(`Erro ao baixar CNEFE de ${sigla}:`, err);
      this.snackBar.open(`Erro ao baixar CNEFE: ${err?.message || err}`, 'Fechar', {
        duration: 5000,
      });
    } finally {
      this.activeOperations.update((map) => {
        const copy = { ...map };
        delete copy[sigla];
        return copy;
      });
    }
  }

  async extractUf(uf: IbgeCnefeUfStatus): Promise<void> {
    const sigla = uf.sigla.toUpperCase();
    this.activeOperations.update((map) => ({ ...map, [sigla]: true }));

    try {
      await this.cnefeApi.extractUf(sigla);
      this.snackBar.open(`Pacote CNEFE de ${uf.name} extraído com sucesso!`, 'OK', {
        duration: 3000,
      });
      await this.loadStatus();
    } catch (err: any) {
      console.error(`Erro ao extrair CNEFE de ${sigla}:`, err);
      this.snackBar.open(`Erro ao extrair: ${err?.message || err}`, 'Fechar', {
        duration: 5000,
      });
    } finally {
      this.activeOperations.update((map) => {
        const copy = { ...map };
        delete copy[sigla];
        return copy;
      });
    }
  }

  async deleteUf(uf: IbgeCnefeUfStatus): Promise<void> {
    const confirmed = confirm(
      `Deseja realmente excluir os arquivos do CNEFE de ${uf.name} (${uf.sigla}) do disco?`
    );
    if (!confirmed) return;

    try {
      await this.cnefeApi.deleteUf(uf.sigla);
      this.snackBar.open(`Arquivos de ${uf.sigla} excluídos com sucesso.`, 'OK', {
        duration: 2500,
      });
      await this.loadStatus();
    } catch (err: any) {
      console.error('Erro ao excluir CNEFE:', err);
      this.snackBar.open(`Erro ao excluir: ${err?.message || err}`, 'Fechar', {
        duration: 4000,
      });
    }
  }

  async downloadRegion(region: string): Promise<void> {
    const ufs = (this.overview()?.ufs ?? []).filter(
      (u) => region === 'all' || u.region === region
    );
    if (ufs.length === 0) return;

    this.isBatchDownloading.set(true);
    let count = 0;

    for (const uf of ufs) {
      try {
        await this.downloadUf(uf);
        count++;
      } catch (e) {
        console.error(`Erro no lote para ${uf.sigla}:`, e);
      }
    }

    this.isBatchDownloading.set(false);
    this.snackBar.open(
      `Download em lote finalizado: ${count}/${ufs.length} UFs processadas.`,
      'OK',
      { duration: 4000 }
    );
    await this.loadStatus();
  }

  async openFolder(): Promise<void> {
    try {
      await this.cnefeApi.openFolder();
    } catch (err: any) {
      console.error('Erro ao abrir pasta:', err);
      this.snackBar.open(`Erro ao abrir pasta: ${err?.message || err}`, 'Fechar', {
        duration: 3000,
      });
    }
  }

  formatBytes(bytes: number): string {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  goBack(): void {
    this.router.navigate(['/desktop']);
  }
}
