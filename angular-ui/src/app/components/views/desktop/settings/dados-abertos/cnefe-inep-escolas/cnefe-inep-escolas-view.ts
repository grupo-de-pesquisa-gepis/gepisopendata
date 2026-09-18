import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Router } from '@angular/router';

import { IbgeCnefeApiService } from '../../../../../../services';
import {
  CnefeSchoolComparisonResult,
  CnefeSchoolQuery,
  CnefeSchoolRecord,
  CnefeSchoolSummary,
} from '../../../../../../models';
import { AutoTooltipDirective } from '../../../../../../directives';

@Component({
  selector: 'app-cnefe-inep-escolas-view',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatChipsModule,
    MatTooltipModule,
    MatTableModule,
    MatPaginatorModule,
    MatExpansionModule,
    MatSnackBarModule,
    AutoTooltipDirective,
  ],
  templateUrl: './cnefe-inep-escolas-view.html',
  styleUrl: './cnefe-inep-escolas-view.css',
})
export class CnefeInepEscolasView implements OnInit {
  private cnefeApi = inject(IbgeCnefeApiService);
  private router = inject(Router);
  private snackBar = inject(MatSnackBar);

  summary = signal<CnefeSchoolSummary | null>(null);
  records = signal<CnefeSchoolRecord[]>([]);
  totalRecords = signal(0);
  isLoading = signal(true);
  isQuerying = signal(false);

  // Filters & Pagination
  searchQuery = signal('');
  selectedStatus = signal<
    'all' | 'georreferenciada' | 'nao_georreferenciada' | 'alta' | 'media' | 'baixa' | 'ambiguo' | 'sem_correspondencia'
  >('all');
  selectedUf = signal<string>('all');
  currentPage = signal(1);
  pageSize = signal(50);

  displayedColumns: string[] = [
    'coEntidade',
    'noEntidade',
    'localizacao',
    'enderecoInep',
    'statusGeolocalizacao',
    'coordenadas',
    'cnefeMatch',
  ];

  statusFilters = [
    { id: 'all', label: 'Todas as Escolas' },
    { id: 'georreferenciada', label: 'Georreferenciadas (Total)' },
    { id: 'alta', label: 'Alta Confiança (Endereço Exato)' },
    { id: 'media', label: 'Média Confiança (CEP + Nome)' },
    { id: 'baixa', label: 'Baixa Confiança (Nome no Município)' },
    { id: 'nao_georreferenciada', label: 'Não Georreferenciadas' },
    { id: 'ambiguo', label: 'Ambíguas' },
    { id: 'sem_correspondencia', label: 'Sem Correspondência' },
  ];

  ngOnInit(): void {
    this.loadData();
  }

  async loadData(): Promise<void> {
    this.isLoading.set(true);
    try {
      const sum = await this.cnefeApi.getComparisonSummary();
      this.summary.set(sum);
      await this.fetchRecords();
    } catch (err: any) {
      console.error('Erro ao carregar cruzamento CNEFE x INEP:', err);
      this.snackBar.open(
        'Erro ao carregar dados do cruzamento: ' + (err?.message || err),
        'Fechar',
        { duration: 4000 }
      );
    } finally {
      this.isLoading.set(false);
    }
  }

  async fetchRecords(): Promise<void> {
    this.isQuerying.set(true);
    try {
      const q: CnefeSchoolQuery = {
        uf: this.selectedUf() === 'all' ? undefined : this.selectedUf(),
        status: this.selectedStatus(),
        search: this.searchQuery().trim() || undefined,
        page: this.currentPage(),
        pageSize: this.pageSize(),
      };
      const res = await this.cnefeApi.querySchoolsComparison(q);
      this.records.set(res.records);
      this.totalRecords.set(res.totalRecords);
    } catch (err: any) {
      console.error('Erro ao consultar escolas:', err);
      this.snackBar.open('Erro ao filtrar escolas: ' + (err?.message || err), 'Fechar', {
        duration: 3000,
      });
    } finally {
      this.isQuerying.set(false);
    }
  }

  onFilterChange(): void {
    this.currentPage.set(1);
    this.fetchRecords();
  }

  onPageChange(event: PageEvent): void {
    this.currentPage.set(event.pageIndex + 1);
    this.pageSize.set(event.pageSize);
    this.fetchRecords();
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'alta':
        return 'status-alta';
      case 'media':
        return 'status-media';
      case 'baixa':
        return 'status-baixa';
      case 'ambiguo':
        return 'status-ambiguo';
      case 'sem_correspondencia':
      default:
        return 'status-sem-corresp';
    }
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'alta':
        return 'Alta Confiança';
      case 'media':
        return 'Média Confiança';
      case 'baixa':
        return 'Baixa Confiança';
      case 'ambiguo':
        return 'Ambíguo';
      case 'sem_correspondencia':
      default:
        return 'Sem Correspondência';
    }
  }

  getStatusIcon(status: string): string {
    switch (status) {
      case 'alta':
        return 'verified';
      case 'media':
        return 'check_circle';
      case 'baixa':
        return 'published_with_changes';
      case 'ambiguo':
        return 'help_outline';
      case 'sem_correspondencia':
      default:
        return 'cancel';
    }
  }

  async openFolder(): Promise<void> {
    try {
      await this.cnefeApi.openFolder();
    } catch (err: any) {
      this.snackBar.open('Erro ao abrir pasta: ' + (err?.message || err), 'Fechar', {
        duration: 3000,
      });
    }
  }

  goToCnefeDownload(): void {
    this.router.navigate(['/desktop/settings/dados-abertos/cnefe-fonte']);
  }

  goBack(): void {
    this.router.navigate(['/desktop']);
  }
}
