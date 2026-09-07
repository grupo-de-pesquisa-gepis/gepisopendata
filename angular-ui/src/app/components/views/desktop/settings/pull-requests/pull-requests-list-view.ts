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
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { invoke } from '@tauri-apps/api/core';

import { GithubApiService } from '../../../../../services';
import { GithubConfig, PullRequestInfo } from '../../../../../models';
import { AutoTooltipDirective } from '../../../../../directives';
import { isTauri } from '../../../../../services/environment';

export interface PrCategory {
  type: 'analysis' | 'dataset' | 'sync' | 'other';
  label: string;
  icon: string;
  cssClass: string;
}

@Component({
  selector: 'app-pull-requests-list-view',
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
    MatChipsModule,
    MatTooltipModule,
    MatSnackBarModule,
    AutoTooltipDirective,
  ],
  templateUrl: './pull-requests-list-view.html',
  styleUrl: './pull-requests-list-view.css',
})
export class PullRequestsListView implements OnInit {
  private githubApi = inject(GithubApiService);
  private router = inject(Router);
  private snackBar = inject(MatSnackBar);

  config = signal<GithubConfig | null>(null);
  pullRequests = signal<PullRequestInfo[]>([]);
  isLoading = signal(true);
  error = signal<string | null>(null);

  filterState = signal<'all' | 'open' | 'closed'>('open');
  filterType = signal<'all' | 'analysis' | 'dataset' | 'sync'>('all');
  searchQuery = signal('');

  totalCount = computed(() => this.pullRequests().length);
  openCount = computed(() => this.pullRequests().filter((p) => p.state === 'open').length);
  closedCount = computed(() => this.pullRequests().filter((p) => p.state === 'closed').length);

  analysisCount = computed(
    () => this.pullRequests().filter((p) => this.getPrCategory(p).type === 'analysis').length
  );
  datasetCount = computed(
    () => this.pullRequests().filter((p) => this.getPrCategory(p).type === 'dataset').length
  );
  syncCount = computed(
    () => this.pullRequests().filter((p) => this.getPrCategory(p).type === 'sync').length
  );

  filteredPullRequests = computed(() => {
    let list = this.pullRequests();

    // 1. Filtrar por estado (Aberto / Fechado)
    const stateFilter = this.filterState();
    if (stateFilter === 'open') {
      list = list.filter((p) => p.state === 'open');
    } else if (stateFilter === 'closed') {
      list = list.filter((p) => p.state === 'closed');
    }

    // 2. Filtrar por tipo (Análise / Dataset / Sync)
    const typeFilter = this.filterType();
    if (typeFilter !== 'all') {
      list = list.filter((p) => this.getPrCategory(p).type === typeFilter);
    }

    // 3. Filtrar por busca de texto
    const query = this.searchQuery().toLowerCase().trim();
    if (!query) return list;

    return list.filter(
      (p) =>
        p.title.toLowerCase().includes(query) ||
        p.userLogin.toLowerCase().includes(query) ||
        p.number.toString().includes(query) ||
        (this.getPrGroupName(p) && this.getPrGroupName(p)!.toLowerCase().includes(query)) ||
        (p.body && p.body.toLowerCase().includes(query))
    );
  });

  ngOnInit(): void {
    this.loadPullRequests();
  }

  async loadPullRequests(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);

    try {
      const cfg = await this.githubApi.getGithubConfig();
      this.config.set(cfg);

      if (!cfg || !cfg.owner || !cfg.repo) {
        this.error.set(
          'Configurações do repositório GitHub incompletas. Acesse Configurações > Colaboração > Config Github para definir o repositório e token.'
        );
        this.isLoading.set(false);
        return;
      }

      const prs = await this.githubApi.listPullRequests('all');
      this.pullRequests.set(prs);
    } catch (err: any) {
      console.error('Erro ao carregar Pull Requests:', err);
      this.error.set(err?.toString() || 'Erro ao comunicar com a API do GitHub.');
    } finally {
      this.isLoading.set(false);
    }
  }

  onFilterStateChange(newState: 'all' | 'open' | 'closed'): void {
    this.filterState.set(newState);
  }

  onFilterTypeChange(newType: 'all' | 'analysis' | 'dataset' | 'sync'): void {
    this.filterType.set(newType);
  }

  getPrCategory(pr: PullRequestInfo): PrCategory {
    const title = pr.title.toLowerCase();
    const branch = (pr.headRef || '').toLowerCase();

    // 1. Prefixo explícito no título
    if (title.startsWith('[análise') || title.startsWith('[analise')) {
      return { type: 'analysis', label: 'Análise', icon: 'assessment', cssClass: 'type-analysis' };
    }
    if (title.startsWith('[dataset')) {
      return { type: 'dataset', label: 'Dataset', icon: 'folder_zip', cssClass: 'type-dataset' };
    }
    if (title.startsWith('[sync')) {
      return { type: 'sync', label: 'Sincronização', icon: 'sync', cssClass: 'type-sync' };
    }

    // 2. Estrutura do branch
    if (branch.includes('/analise/') || branch.includes('/analysis/') || branch.endsWith('/analises')) {
      return { type: 'analysis', label: 'Análise', icon: 'assessment', cssClass: 'type-analysis' };
    }
    if (branch.includes('/dataset/')) {
      return { type: 'dataset', label: 'Dataset', icon: 'folder_zip', cssClass: 'type-dataset' };
    }
    if (branch.includes('/sync/') || branch.endsWith('/sync') || branch.includes('sync')) {
      return { type: 'sync', label: 'Sincronização', icon: 'sync', cssClass: 'type-sync' };
    }

    // 3. Fallbacks no texto do título
    if (title.includes('sincroniz') || title.includes('sync')) {
      return { type: 'sync', label: 'Sincronização', icon: 'sync', cssClass: 'type-sync' };
    }
    if (title.includes('análise') || title.includes('analise')) {
      return { type: 'analysis', label: 'Análise', icon: 'assessment', cssClass: 'type-analysis' };
    }
    if (title.includes('dataset') || title.includes('conjunto de dados')) {
      return { type: 'dataset', label: 'Dataset', icon: 'folder_zip', cssClass: 'type-dataset' };
    }

    return { type: 'other', label: 'Contribuição', icon: 'commit', cssClass: 'type-other' };
  }

  getPrGroupName(pr: PullRequestInfo): string | null {
    // Extrai o grupo a partir do padrão [Tipo | Grupo]
    const match = pr.title.match(/\[.*?\s*\|\s*(.*?)\]/);
    if (match && match[1]) {
      return match[1].trim();
    }
    // Extrai do branch: contrib/analise/censo-escolar/...
    if (pr.headRef) {
      const parts = pr.headRef.split('/');
      if (parts.length >= 3) {
        return parts[2].replace(/-/g, ' ');
      }
    }
    return null;
  }

  getCleanTitle(pr: PullRequestInfo): string {
    const prefixIndex = pr.title.indexOf(']');
    if (prefixIndex !== -1 && prefixIndex < pr.title.length - 1) {
      return pr.title.substring(prefixIndex + 1).trim();
    }
    return pr.title;
  }

  async openPrUrl(url: string): Promise<void> {
    if (!url) return;
    if (isTauri()) {
      try {
        await invoke('plugin:shell|open', { path: url });
      } catch (err) {
        console.error('Erro ao abrir link no navegador padrão:', err);
        window.open(url, '_blank');
      }
    } else {
      window.open(url, '_blank');
    }
  }

  goToSettings(): void {
    this.router.navigate(['/desktop/settings/collaboration']);
  }

  goBack(): void {
    this.router.navigate(['/desktop']);
  }
}
