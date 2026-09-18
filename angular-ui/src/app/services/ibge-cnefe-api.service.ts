import { Injectable, signal } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { isTauri } from './environment';
import {
  CnefeInepMatchProgress,
  CnefeInepMatchRequest,
  CnefeSchoolComparisonResult,
  CnefeSchoolQuery,
  CnefeSchoolSummary,
  IbgeCnefeDownloadProgress,
  IbgeCnefeDownloadRequest,
  IbgeCnefeOverview,
} from '../models';

@Injectable({
  providedIn: 'root',
})
export class IbgeCnefeApiService {
  downloadProgress = signal<IbgeCnefeDownloadProgress | null>(null);
  matchProgress = signal<CnefeInepMatchProgress | null>(null);
  private unlistenProgress?: UnlistenFn;
  private unlistenMatchProgress?: UnlistenFn;

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

      try {
        this.unlistenMatchProgress = await listen<CnefeInepMatchProgress>(
          'cnefe-inep-match-progress',
          (event) => {
            this.matchProgress.set(event.payload);
          }
        );
      } catch (err) {
        console.warn('Não foi possível registrar listener de progresso de cruzamento:', err);
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

  async getComparisonSummary(): Promise<CnefeSchoolSummary> {
    if (!isTauri()) {
      return {
        anoCenso: '2024',
        cnefeAno: '2022',
        datasetOrigemCenso: 'Microdados da Educação Básica 2024 (INEP)',
        totalEscolas: 22535,
        totalGeorreferenciadas: 20120,
        percGeorreferenciadas: 89.28,
        altaConfianca: 17650,
        percAlta: 78.32,
        mediaConfianca: 1850,
        percMedia: 8.21,
        baixaConfianca: 620,
        percBaixa: 2.75,
        ambiguas: 435,
        percAmbiguas: 1.93,
        semCorrespondencia: 1980,
        percSemCorrespondencia: 8.79,
        totalCnefeEnsino: 52410,
        cnefeNaoCenso: 32290,
        percCnefeNaoCenso: 61.61,
        ufsProcessadas: ['SP'],
        inepCensoDisponivel: true,
        cnefeDisponivel: true,
        outputFilePath: 'data/escolas_dados.csv',
      };
    }
    return await invoke<CnefeSchoolSummary>('get_cnefe_inep_summary');
  }

  async querySchoolsComparison(
    query: CnefeSchoolQuery
  ): Promise<CnefeSchoolComparisonResult> {
    if (!isTauri()) {
      return {
        summary: await this.getComparisonSummary(),
        records: [
          {
            coEntidade: '35030806',
            noEntidade: 'ESCOLA HELEN KELLER',
            sgUf: 'SP',
            coUf: '35',
            noMunicipio: 'Adamantina',
            coMunicipio: '3500105',
            coCep: '17800000',
            dsEndereco: 'MARIO OLIVERO',
            nuEndereco: '122',
            noBairro: 'VILA CICMA',
            tpDependencia: '2',
            tpLocalizacao: '1',
            latitude: '-21.692973',
            longitude: '-51.068637',
            cnefeNvGeoCoord: '1',
            cnefeDscEstabelecimento: 'ESCOLA HELEN KELLER',
            statusGeolocalizacao: 'alta',
            confiancaNome: '1.000',
          },
        ],
        totalRecords: 1,
        page: 1,
        pageSize: 50,
      };
    }
    return await invoke<CnefeSchoolComparisonResult>('query_cnefe_inep_schools', {
      query,
    });
  }

  async runMatching(req: CnefeInepMatchRequest = {}): Promise<CnefeSchoolSummary> {
    if (!isTauri()) {
      return await this.getComparisonSummary();
    }
    return await invoke<CnefeSchoolSummary>('run_cnefe_inep_match', { req });
  }
}
