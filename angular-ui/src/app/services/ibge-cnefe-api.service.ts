import { Injectable, signal } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { isTauri } from './environment';
import {
  IbgeCnefeDownloadProgress,
  IbgeCnefeDownloadRequest,
  IbgeCnefeOverview,
} from '../models';

@Injectable({
  providedIn: 'root',
})
export class IbgeCnefeApiService {
  downloadProgress = signal<IbgeCnefeDownloadProgress | null>(null);
  private unlistenProgress?: UnlistenFn;

  constructor() {
    this.initProgressListener();
  }

  private async initProgressListener(): Promise<void> {
    if (isTauri()) {
      try {
        this.unlistenProgress = await listen<IbgeCnefeDownloadProgress>(
          'cnefe-download-progress',
          (event) => {
            this.downloadProgress.set(event.payload);
          }
        );
      } catch (err) {
        console.warn('Não foi possível registrar listener de progresso CNEFE:', err);
      }
    }
  }

  async getStatus(): Promise<IbgeCnefeOverview> {
    if (!isTauri()) {
      return {
        ufs: [
          {
            code: '35',
            sigla: 'SP',
            name: 'São Paulo',
            region: 'Sudeste',
            packageName: '35_SP',
            zipFileName: '35_SP.zip',
            zipFilePath: 'data/ibge_cnefe/zipfiles/35_SP.zip',
            zipSizeBytes: 104857600,
            zipExists: true,
            isExtracted: true,
            csvFileName: '35_SP.csv',
            csvFilePath: 'data/ibge_cnefe/zipfiles/35_SP/35_SP.csv',
            csvSizeBytes: 450000000,
            csvExists: true,
          },
        ],
        totalSizeBytes: 104857600,
        totalZipCount: 1,
        totalExtractedCount: 1,
        cnefeDir: 'data/ibge_cnefe/zipfiles',
      };
    }
    return await invoke<IbgeCnefeOverview>('get_ibge_cnefe_status');
  }

  async downloadUf(req: IbgeCnefeDownloadRequest): Promise<string> {
    if (!isTauri()) {
      throw new Error('Download de CNEFE do IBGE não é suportado no modo Web.');
    }
    return await invoke<string>('download_ibge_cnefe_uf', { req });
  }

  async extractUf(uf: string): Promise<string> {
    if (!isTauri()) {
      throw new Error('Extração de CNEFE não é suportada no modo Web.');
    }
    return await invoke<string>('extract_ibge_cnefe_uf', { uf });
  }

  async deleteUf(uf: string): Promise<boolean> {
    if (!isTauri()) {
      throw new Error('Exclusão de CNEFE não é suportada no modo Web.');
    }
    return await invoke<boolean>('delete_ibge_cnefe_uf', { uf });
  }

  async openFolder(): Promise<void> {
    if (!isTauri()) {
      throw new Error('Abertura de pastas não é suportada no modo Web.');
    }
    await invoke('open_ibge_cnefe_folder');
  }
}
