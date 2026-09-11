import { Injectable, signal, inject } from '@angular/core';
import { AnalysisConfig, AnalysisArtifact, VariableSpec } from '../models';
import { AnalysisApiService } from './analysis-api.service';
import { GithubApiService } from './github-api.service';
import { isTauri } from './environment';

export type { AnalysisConfig, AnalysisArtifact, VariableSpec };

@Injectable({
  providedIn: 'root'
})
export class DatasetStateService {
  private analysisApi = inject(AnalysisApiService);
  private githubApi = inject(GithubApiService);

  selectedGroup = signal<string | null>(localStorage.getItem('selectedGroup'));
  allAnalyses = signal<AnalysisConfig[]>([]);
  currentAnalysis = signal<AnalysisConfig | null>(null);

  constructor() {
    this.refreshHistory();
  }

  async refreshHistory() {
    try {
      const history = await this.analysisApi.getAnalyses();
      this.allAnalyses.set(
        history.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())
      );

      if (!this.currentAnalysis() && history.length > 0) {
        this.currentAnalysis.set(history[0]);
      }
    } catch (err) {
      console.error('Erro ao carregar histórico de análises:', err);
    }
  }

  setSelectedGroup(name: string) {
    this.selectedGroup.set(name);
    localStorage.setItem('selectedGroup', name);
  }

  getSelectedGroup(): string | null {
    return this.selectedGroup();
  }

  clearSelectedGroupIfMatches(name: string) {
    if (this.selectedGroup() === name) {
      this.selectedGroup.set(null);
      localStorage.removeItem('selectedGroup');
    }
  }

  async saveAnalysis(config: AnalysisConfig) {
    try {
      await this.analysisApi.saveAnalysis(config);
      await this.refreshHistory();
      const saved = this.allAnalyses().find(a => (config.id && a.id === config.id) || a.name === config.name);
      if (saved) this.currentAnalysis.set(saved);
    } catch (err) {
      console.error('Erro ao salvar análise:', err);
    }
  }

  async publishAnalysis(id: string): Promise<string> {
    try {
      const result = await this.githubApi.publishAnalysis(id);
      await this.refreshHistory();
      return result;
    } catch (err) {
      console.error('Erro ao publicar análise:', err);
      throw err;
    }
  }

  async syncAnalysesWithSite(): Promise<string> {
    try {
      const result = await this.githubApi.publishAnalysis(null);
      return result;
    } catch (err) {
      console.error('Erro ao sincronizar análises:', err);
      throw err;
    }
  }

  async deleteAnalysis(id: string) {
    try {
      await this.analysisApi.deleteAnalysis(id);
      if (this.currentAnalysis()?.id === id) {
        this.currentAnalysis.set(null);
      }
      await this.refreshHistory();
    } catch (err) {
      console.error('Erro ao deletar análise:', err);
    }
  }

  async deleteArtifact(analysisId: string, artifactId: string) {
    try {
      const analyses = this.allAnalyses();
      const target = analyses.find(a => a.id === analysisId);
      if (!target || !target.publishedArtifacts) return;

      target.publishedArtifacts = target.publishedArtifacts.filter(art => art.id !== artifactId);
      await this.saveAnalysis(target);
    } catch (err) {
      console.error('Erro ao deletar publicação/gráfico:', err);
      throw err;
    }
  }

  setCurrentAnalysis(analysis: AnalysisConfig) {
    this.currentAnalysis.set(analysis);
  }

  getAnalysisConfig(): AnalysisConfig | null {
    return this.currentAnalysis();
  }
}
