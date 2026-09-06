import { Injectable } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { isTauri } from './environment';
import { GithubConfig } from '../models';

@Injectable({
  providedIn: 'root',
})
export class GithubApiService {
  async getGithubConfig(): Promise<GithubConfig | null> {
    if (!isTauri()) {
      return null;
    }
    return await invoke<GithubConfig | null>('get_github_config');
  }

  async saveGithubConfig(config: GithubConfig): Promise<void> {
    if (!isTauri()) {
      throw new Error('Configuração do GitHub não suportada no modo Web.');
    }
    await invoke('save_github_config', { config });
  }

  async testConnection(token: string, owner: string, repo: string): Promise<string> {
    if (!isTauri()) {
      throw new Error('Teste de conexão do GitHub não suportado no modo Web.');
    }
    return await invoke<string>('test_github_connection', { token, owner, repo });
  }

  async pushDataset(datasetId: string): Promise<string> {
    if (!isTauri()) {
      throw new Error('Publicação no GitHub não suportada no modo Web.');
    }
    return await invoke<string>('push_dataset_to_github', { datasetId });
  }

  async publishAnalysis(id?: string | null): Promise<string> {
    if (!isTauri()) {
      throw new Error('Publicação no GitHub não suportada no modo Web.');
    }
    return await invoke<string>('publish_analysis', { id: id ?? null });
  }
}
