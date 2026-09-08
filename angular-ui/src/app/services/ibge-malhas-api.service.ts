import { Injectable, signal } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { isTauri } from './environment';
import {
  IbgeDownloadProgress,
  IbgeDownloadRequest,
  IbgeMalhasOverview,
} from '../models';

@Injectable({
  providedIn: 'root',
})
export class IbgeMalhasApiService {
  downloadProgress = signal<IbgeDownloadProgress | null>(null);

  private unlistenProgress?: UnlistenFn;

  constructor() {
    this.initProgressListener();
  }

  private async initProgressListener(): Promise<void> {
    if (isTauri()) {
      try {
        this.unlistenProgress = await listen<IbgeDownloadProgress>(
          'ibge-download-progress',
          (event) => {
            this.downloadProgress.set(event.payload);
          }
        );
      } catch (err) {
        console.warn('Não foi possível registrar listener de progresso IBGE:', err);
      }
    }
  }

  async getStatus(): Promise<IbgeMalhasOverview> {
    if (!isTauri()) {
      return {
        levels: [
          {
            id: 'pais',
            name: 'País (Brasil)',
            description: 'Contorno territorial completo do Brasil',
            packageName: 'BR_Pais_2024',
            expectedFeatures: 1,
            geojsonFiles: [
              {
                format: 'geojson',
                quality: 'minima',
                fileName: 'BR_Pais_2024_minima.geojson',
                filePath: '/data/ibge_malhas/geojsonfiles/BR_Pais_2024_minima.geojson',
                sizeBytes: 15360,
                exists: false,
                isExtracted: false,
              },
            ],
            shapefile: {
              format: 'shapefile',
              fileName: 'BR_Pais_2024.zip',
              filePath: '/data/ibge_malhas/zipfiles/BR_Pais_2024.zip',
              sizeBytes: 1048576,
              exists: false,
              isExtracted: false,
            },
          },
        ],
        totalSizeBytes: 0,
        totalFilesCount: 0,
        malhasDir: 'data/ibge_malha_municipal',
      };
    }
    return await invoke<IbgeMalhasOverview>('get_ibge_malhas_status');
  }

  async downloadMalha(req: IbgeDownloadRequest): Promise<string> {
    if (!isTauri()) {
      throw new Error('Download de malhas do IBGE não é suportado no modo Web.');
    }
    return await invoke<string>('download_ibge_malha', { req });
  }

  async deleteMalha(
    level: string,
    format: string,
    quality?: string | null
  ): Promise<boolean> {
    if (!isTauri()) {
      throw new Error('Exclusão de malhas não é suportada no modo Web.');
    }
    return await invoke<boolean>('delete_ibge_malha', {
      level,
      format,
      quality: quality ?? null,
    });
  }

  async openFolder(): Promise<void> {
    if (!isTauri()) {
      throw new Error('Abertura de pastas não é suportada no modo Web.');
    }
    await invoke('open_ibge_malhas_folder');
  }
}
