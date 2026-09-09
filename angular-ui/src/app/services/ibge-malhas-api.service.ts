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

  async getGeoJsonData(
    level: string,
    quality: string = 'minima'
  ): Promise<{ data: any; sizeBytes: number }> {
    if (isTauri()) {
      try {
        const jsonStr = await invoke<string>('get_or_load_ibge_geojson', {
          level,
          quality,
        });
        const sizeBytes = new Blob([jsonStr]).size;
        const data = JSON.parse(jsonStr);
        return { data, sizeBytes };
      } catch (e) {
        console.warn('Falha ao carregar GeoJSON via Tauri, tentando fallback local/web:', e);
      }
    }

    const localMap: Record<string, string> = {
      pais: 'data/BR_pais_2024_minima.geojson',
      regioes: 'data/BR_regioes_2024_minima.geojson',
      uf: 'data/BR_uf_2024_minima.geojson',
      intermediarias: 'data/BR_intermediarias_2024_minima.geojson',
      imediatas: 'data/BR_imediatas_2024_minima.geojson',
      microrregioes: 'data/BR_Microrregioes_2016_minima.geojson',
      municipios: 'data/BR_municipios_2024_minima.geojson',
    };

    const filePath = localMap[level] || `data/BR_${level}_2024_${quality}.geojson`;
    const resp = await fetch(filePath);
    if (!resp.ok) {
      throw new Error(`Falha HTTP ${resp.status} ao carregar ${filePath}`);
    }
    const text = await resp.text();
    const sizeBytes = new Blob([text]).size;
    return { data: JSON.parse(text), sizeBytes };
  }
}

