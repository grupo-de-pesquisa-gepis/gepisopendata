import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { invoke } from '@tauri-apps/api/core';
import { message, ask } from '@tauri-apps/plugin-dialog';
import { DatasetApiService, GithubApiService, DatasetStateService } from '../../../../../services';
import { DatasetEntry, DatasetMetadata } from '../../../../../models';

@Component({
  selector: 'app-dataset-list-view',
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatExpansionModule,
    MatChipsModule,
    MatTooltipModule,
    MatProgressBarModule,
    MatSnackBarModule,
    RouterLink,
  ],
  templateUrl: './dataset-list-view.html',
  styleUrl: './dataset-list-view.css',
})
export class DatasetListView implements OnInit {
  private datasetApi = inject(DatasetApiService);
  private githubApi = inject(GithubApiService);
  private datasetState = inject(DatasetStateService);
  private snackBar = inject(MatSnackBar);

  datasets = signal<DatasetEntry[]>([]);
  groupedDatasets = signal<{ name: string; items: DatasetEntry[] }[]>([]);
  isRedownloading = signal<string | null>(null);
  isCollaborating = signal<string | null>(null);

  ngOnInit() {
    this.loadDatasets();
  }

  async deleteDataset(item: DatasetEntry) {
    const confirmed = await ask(
      `Tem certeza que deseja excluir o dataset "${item.tituloCurto}"? Todos os arquivos locais serão removidos.`,
      {
        title: 'Confirmar Exclusão',
        kind: 'warning',
        okLabel: 'Excluir',
        cancelLabel: 'Cancelar',
      }
    );

    if (confirmed) {
      try {
        await this.datasetApi.deleteDataset(item.id);
        await message('Dataset excluído com sucesso.', { title: 'Sucesso', kind: 'info' });
        await this.loadDatasets();
      } catch (err) {
        console.error('Error deleting dataset:', err);
        await message(`Falha ao excluir: ${err}`, { title: 'Erro', kind: 'error' });
      }
    }
  }

  async deleteGroup(event: Event, groupName: string) {
    event.stopPropagation();
    const targetGroup = groupName === 'Sem Grupo' ? '' : groupName;

    const confirmed = await ask(
      `Tem certeza que deseja excluir TODO o grupo "${groupName || 'Sem Grupo'}"? Isso removerá todos os datasets e arquivos desta coleção.`,
      {
        title: 'Confirmar Exclusão de Grupo',
        kind: 'warning',
        okLabel: 'Excluir Tudo',
        cancelLabel: 'Cancelar',
      }
    );

    if (confirmed) {
      try {
        await this.datasetApi.deleteGroup(targetGroup);
        await message('Grupo excluído com sucesso.', { title: 'Sucesso', kind: 'info' });
        await this.loadDatasets();
      } catch (err) {
        console.error('Error deleting group:', err);
        await message(`Falha ao excluir grupo: ${err}`, { title: 'Erro', kind: 'error' });
      }
    }
  }

  async loadDatasets() {
    try {
      const data = await this.datasetApi.getRegistry();

      // Check file existence for each item
      const datasetsWithStatus = await Promise.all(
        data.map(async (item) => {
          const pathExists = item.localPath
            ? await this.datasetApi.checkPathExists(item.localPath)
            : false;
          return { ...item, exists: pathExists };
        })
      );

      this.datasets.set(datasetsWithStatus);

      // Grouping logic
      const groups = datasetsWithStatus.reduce((acc: Record<string, DatasetEntry[]>, item) => {
        const groupName = item.grupo || 'Sem Grupo';
        if (!acc[groupName]) acc[groupName] = [];
        acc[groupName].push(item);
        return acc;
      }, {});

      const groupArray = Object.keys(groups).map((name) => ({
        name,
        items: groups[name],
      }));

      this.groupedDatasets.set(groupArray);

      // Limpar o estado do grupo selecionado se ele não existir mais
      const selected = this.datasetState.getSelectedGroup();
      if (selected && !groups[selected]) {
        this.datasetState.clearSelectedGroupIfMatches(selected);
      }
    } catch (err) {
      console.error('Error loading datasets:', err);
    }
  }

  async redownload(item: DatasetEntry) {
    if (!item.urls) return;
    this.isRedownloading.set(item.id);
    try {
      await this.datasetApi.downloadDataset(item.urls, item as DatasetMetadata);

      await message(`O conjunto de dados "${item.tituloCurto}" foi baixado novamente com sucesso!`, {
        title: 'Sucesso',
        kind: 'info',
      });

      await this.loadDatasets();
    } catch (err) {
      console.error('Redownload failed:', err);
      await message(`Falha ao baixar novamente: ${err}`, { title: 'Erro', kind: 'error' });
    } finally {
      this.isRedownloading.set(null);
    }
  }

  async openFolder(path: string) {
    try {
      await invoke('plugin:shell|open', { path });
    } catch (err) {
      console.error('Error opening folder:', err);
    }
  }

  async openUrl(url: string) {
    try {
      await invoke('plugin:shell|open', { path: url });
    } catch (err) {
      console.error('Error opening URL:', err);
    }
  }

  async collaborate(item: DatasetEntry) {
    this.isCollaborating.set(item.id);
    try {
      const result = await this.githubApi.pushDataset(item.id);
      this.snackBar.open(result, 'OK', { duration: 5000 });
    } catch (err) {
      this.snackBar.open(`Erro ao colaborar: ${err}`, 'Fechar', { duration: 8000 });
    } finally {
      this.isCollaborating.set(null);
    }
  }
}
