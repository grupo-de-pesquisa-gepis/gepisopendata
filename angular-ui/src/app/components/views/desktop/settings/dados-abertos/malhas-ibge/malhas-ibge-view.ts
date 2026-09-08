import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Router } from '@angular/router';

import { IbgeMalhasApiService } from '../../../../../../services';
import {
  IbgeMalhasOverview,
  IbgeMalhaLevelStatus,
  IbgeMalhaFileStatus,
  IbgeDownloadRequest,
} from '../../../../../../models';
import { AutoTooltipDirective } from '../../../../../../directives';

@Component({
  selector: 'app-malhas-ibge-view',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatChipsModule,
    MatTooltipModule,
    MatSnackBarModule,
    AutoTooltipDirective,
  ],
  templateUrl: './malhas-ibge-view.html',
  styleUrl: './malhas-ibge-view.css',
})
export class MalhasIbgeView implements OnInit {
  private ibgeApi = inject(IbgeMalhasApiService);
  private router = inject(Router);
  private snackBar = inject(MatSnackBar);

  overview = signal<IbgeMalhasOverview | null>(null);
  isLoading = signal(true);
  isBatchDownloading = signal(false);
  activeOperations = signal<Record<string, boolean>>({});

  enrichNames = signal(true);
  extractZip = signal(true);
  selectedQuality = signal<Record<string, 'minima' | 'intermediaria' | 'maxima'>>({
    pais: 'minima',
    regioes: 'minima',
    uf: 'minima',
    intermediarias: 'minima',
    imediatas: 'minima',
    municipios: 'minima',
  });

  searchQuery = signal('');

  downloadProgress = this.ibgeApi.downloadProgress;

  totalFiles = computed(() => this.overview()?.totalFilesCount ?? 0);
  totalSizeFormatted = computed(() =>
    this.formatBytes(this.overview()?.totalSizeBytes ?? 0)
  );

  filteredLevels = computed(() => {
    const list = this.overview()?.levels ?? [];
    const q = this.searchQuery().toLowerCase().trim();
    if (!q) return list;
    return list.filter(
      (lvl) =>
        lvl.name.toLowerCase().includes(q) ||
        lvl.id.toLowerCase().includes(q) ||
        lvl.packageName.toLowerCase().includes(q) ||
        lvl.description.toLowerCase().includes(q)
    );
  });

  ngOnInit(): void {
    this.loadStatus();
  }

  async loadStatus(): Promise<void> {
    this.isLoading.set(true);
    try {
      const data = await this.ibgeApi.getStatus();
      this.overview.set(data);
    } catch (err: any) {
      console.error('Erro ao carregar status das malhas IBGE:', err);
      this.snackBar.open('Erro ao verificar status das malhas: ' + err?.message, 'Fechar', {
        duration: 4000,
      });
    } finally {
      this.isLoading.set(false);
    }
  }

  getGeojsonStatus(
    level: IbgeMalhaLevelStatus,
    quality: string
  ): IbgeMalhaFileStatus | undefined {
    return level.geojsonFiles.find((f) => f.quality === quality);
  }

  getQualityForLevel(levelId: string): 'minima' | 'intermediaria' | 'maxima' {
    return this.selectedQuality()[levelId] || 'minima';
  }

  setQualityForLevel(
    levelId: string,
    quality: 'minima' | 'intermediaria' | 'maxima'
  ): void {
    this.selectedQuality.update((map) => ({ ...map, [levelId]: quality }));
  }

  isOperationActive(key: string): boolean {
    return !!this.activeOperations()[key];
  }

  async downloadGeojson(levelId: string, customQuality?: 'minima' | 'intermediaria' | 'maxima'): Promise<void> {
    const quality = customQuality || this.getQualityForLevel(levelId);
    const opKey = `${levelId}_geojson_${quality}`;
    this.activeOperations.update((map) => ({ ...map, [opKey]: true }));

    try {
      const req: IbgeDownloadRequest = {
        level: levelId,
        format: 'geojson',
        quality,
        enrichNames: this.enrichNames(),
      };
      await this.ibgeApi.downloadMalha(req);
      this.snackBar.open(`GeoJSON (${quality}) de ${levelId} baixado com sucesso!`, 'OK', {
        duration: 3000,
      });
      await this.loadStatus();
    } catch (err: any) {
      console.error(`Erro ao baixar GeoJSON de ${levelId}:`, err);
      this.snackBar.open(`Erro ao baixar GeoJSON: ${err?.message || err}`, 'Fechar', {
        duration: 5000,
      });
    } finally {
      this.activeOperations.update((map) => {
        const copy = { ...map };
        delete copy[opKey];
        return copy;
      });
    }
  }

  async downloadShapefile(levelId: string): Promise<void> {
    const opKey = `${levelId}_shapefile`;
    this.activeOperations.update((map) => ({ ...map, [opKey]: true }));

    try {
      const req: IbgeDownloadRequest = {
        level: levelId,
        format: 'shapefile',
        extractZip: this.extractZip(),
      };
      await this.ibgeApi.downloadMalha(req);
      this.snackBar.open(`Shapefile de ${levelId} baixado com sucesso!`, 'OK', {
        duration: 3000,
      });
      await this.loadStatus();
    } catch (err: any) {
      console.error(`Erro ao baixar Shapefile de ${levelId}:`, err);
      this.snackBar.open(`Erro ao baixar Shapefile: ${err?.message || err}`, 'Fechar', {
        duration: 5000,
      });
    } finally {
      this.activeOperations.update((map) => {
        const copy = { ...map };
        delete copy[opKey];
        return copy;
      });
    }
  }

  async deleteFile(levelId: string, format: 'geojson' | 'shapefile', quality?: string): Promise<void> {
    const confirmed = confirm(
      `Deseja realmente remover os arquivos de ${levelId} (${format}${quality ? ' ' + quality : ''}) do disco?`
    );
    if (!confirmed) return;

    try {
      await this.ibgeApi.deleteMalha(levelId, format, quality);
      this.snackBar.open('Arquivo removido com sucesso.', 'OK', { duration: 2500 });
      await this.loadStatus();
    } catch (err: any) {
      console.error('Erro ao excluir arquivo:', err);
      this.snackBar.open(`Erro ao excluir: ${err?.message || err}`, 'Fechar', {
        duration: 4000,
      });
    }
  }

  async downloadAllGeojson(quality: 'minima' | 'intermediaria' | 'maxima' = 'minima'): Promise<void> {
    const levels = this.overview()?.levels ?? [];
    if (levels.length === 0) return;

    this.isBatchDownloading.set(true);
    let successCount = 0;

    for (const lvl of levels) {
      try {
        await this.downloadGeojson(lvl.id, quality);
        successCount++;
      } catch (e) {
        console.error(`Erro no lote para ${lvl.id}:`, e);
      }
    }

    this.isBatchDownloading.set(false);
    this.snackBar.open(
      `Download em lote de GeoJSONs finalizado (${successCount}/${levels.length} concluídos).`,
      'OK',
      { duration: 4000 }
    );
    await this.loadStatus();
  }

  async downloadAllShapefiles(): Promise<void> {
    const levels = this.overview()?.levels ?? [];
    if (levels.length === 0) return;

    this.isBatchDownloading.set(true);
    let successCount = 0;

    for (const lvl of levels) {
      try {
        await this.downloadShapefile(lvl.id);
        successCount++;
      } catch (e) {
        console.error(`Erro no lote para ${lvl.id}:`, e);
      }
    }

    this.isBatchDownloading.set(false);
    this.snackBar.open(
      `Download em lote de Shapefiles finalizado (${successCount}/${levels.length} concluídos).`,
      'OK',
      { duration: 4000 }
    );
    await this.loadStatus();
  }

  async openFolder(): Promise<void> {
    try {
      await this.ibgeApi.openFolder();
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
