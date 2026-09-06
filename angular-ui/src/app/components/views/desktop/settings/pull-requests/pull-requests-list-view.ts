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
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { invoke } from '@tauri-apps/api/core';

import { GithubApiService } from '../../../../../services';
import { GithubConfig, PullRequestInfo } from '../../../../../models';
import { AutoTooltipDirective } from '../../../../../directives';
import { isTauri } from '../../../../../services/environment';

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

  filterState = signal<'all' | 'open' | 'closed'>('all');
  searchQuery = signal('');

  totalCount = computed(() => this.pullRequests().length);
  openCount = computed(() => this.pullRequests().filter((p) => p.state === 'open').length);
  closedCount = computed(() => this.pullRequests().filter((p) => p.state === 'closed').length);

  filteredPullRequests = computed(() => {
    let list = this.pullRequests();
    const filter = this.filterState();
    if (filter === 'open') {
      list = list.filter((p) => p.state === 'open');
    } else if (filter === 'closed') {
      list = list.filter((p) => p.state === 'closed');
    }

    const query = this.searchQuery().toLowerCase().trim();
    if (!query) return list;

    return list.filter(
      (p) =>
        p.title.toLowerCase().includes(query) ||
        p.userLogin.toLowerCase().includes(query) ||
        p.number.toString().includes(query) ||
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
