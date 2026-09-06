import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { firstValueFrom, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { isTauri } from './environment';
import { DatasetEntry, DatasetMetadata, DownloadProgress } from '../models';

@Injectable({
  providedIn: 'root',
})
export class DatasetApiService {
  private http = inject(HttpClient);

  // Reactive signal for real-time download progress
  downloadProgress = signal<DownloadProgress | null>(null);
  private unlistenProgressFn: UnlistenFn | null = null;

  constructor() {
    this.initProgressListener();
  }

  private async initProgressListener() {
    if (isTauri()) {
      try {
        this.unlistenProgressFn = await listen<DownloadProgress>('download-progress', (event) => {
          this.downloadProgress.set(event.payload);
        });
      } catch (err) {
        console.warn('Não foi possível registrar listener para download-progress:', err);
      }
    }
  }

  async getRegistry(): Promise<DatasetEntry[]> {
    if (isTauri()) {
      return await invoke<DatasetEntry[]>('get_registry');
    }

    const result = await firstValueFrom(
      this.http.get<DatasetEntry[]>('data/datasets-registry.json').pipe(
        catchError(() => of([]))
      )
    );
    return result || [];
  }

  async downloadDataset(url: string, metadata: DatasetMetadata): Promise<string> {
    if (!isTauri()) {
      throw new Error('Download de datasets não é suportado no modo Web.');
    }
    this.downloadProgress.set({ downloaded: 0, total: 0, percent: 0 });
    try {
      const result = await invoke<string>('download_dataset', { url, metadata });
      return result;
    } finally {
      this.downloadProgress.set(null);
    }
  }

  async importLocalDataset(filePaths: string[], metadata: DatasetMetadata): Promise<string> {
    if (!isTauri()) {
      throw new Error('Importação local não é suportada no modo Web.');
    }
    return await invoke<string>('import_local_dataset', { filePaths, metadata });
  }

  async deleteDataset(id: string): Promise<void> {
    if (!isTauri()) {
      throw new Error('Exclusão não suportada no modo Web.');
    }
    await invoke('delete_dataset', { id });
  }

  async deleteGroup(groupName: string): Promise<void> {
    if (!isTauri()) {
      throw new Error('Exclusão de grupo não suportada no modo Web.');
    }
    await invoke('delete_group', { groupName });
  }

  async checkPathExists(path: string): Promise<boolean> {
    if (!isTauri()) {
      return false;
    }
    return await invoke<boolean>('check_path_exists', { path });
  }

  async getAppDataDir(): Promise<string> {
    if (!isTauri()) {
      return '';
    }
    return await invoke<string>('get_app_data_dir');
  }
}
