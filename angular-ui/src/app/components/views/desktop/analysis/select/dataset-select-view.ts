import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatRadioModule } from '@angular/material/radio';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DatasetApiService, DatasetStateService } from '../../../../../services';
import { DatasetEntry } from '../../../../../models';

interface DatasetGroup {
  name: string;
  items: DatasetEntry[];
  isAvailable: boolean;
}

@Component({
  selector: 'app-dataset-select-view',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatRadioModule,
    MatExpansionModule,
    MatDividerModule,
    MatTooltipModule,
    MatChipsModule,
    FormsModule,
  ],
  templateUrl: './dataset-select-view.html',
  styleUrl: './dataset-select-view.css',
})
export class DatasetSelectView implements OnInit {
  private router = inject(Router);
  private datasetApi = inject(DatasetApiService);
  private stateService = inject(DatasetStateService);

  datasets = signal<DatasetEntry[]>([]);
  selectedGroupName = signal<string | null>(this.stateService.getSelectedGroup());

  groupedDatasets = computed<DatasetGroup[]>(() => {
    const data = this.datasets();
    const groupsMap = data.reduce((acc: Record<string, DatasetEntry[]>, item) => {
      const groupName = item.grupo || '';
      if (!acc[groupName]) acc[groupName] = [];
      acc[groupName].push(item);
      return acc;
    }, {});

    return Object.keys(groupsMap)
      .sort()
      .map((name) => {
        const items = groupsMap[name];
        // A group is available only if ALL its items exist on disk
        const isAvailable = items.every((item) => item.exists !== false);

        return {
          name,
          items,
          isAvailable,
        };
      });
  });

  ngOnInit() {
    this.loadDatasets();
  }

  async loadDatasets() {
    try {
      const data = await this.datasetApi.getRegistry();

      const datasetsWithStatus = await Promise.all(
        data.map(async (item) => {
          const pathExists = item.localPath
            ? await this.datasetApi.checkPathExists(item.localPath)
            : false;
          return { ...item, exists: pathExists };
        })
      );

      this.datasets.set(datasetsWithStatus);
    } catch (err) {
      console.error('Error loading datasets for selection:', err);
    }
  }

  selectGroup(name: string) {
    this.selectedGroupName.set(name);
  }

  confirmSelection() {
    const groupName = this.selectedGroupName();
    const group = this.groupedDatasets().find((g) => g.name === groupName);

    if (group && groupName) {
      console.log('Grupo selecionado para análise:', group.name);
      this.stateService.setSelectedGroup(groupName);
      this.stateService.currentAnalysis.set(null);
      this.router.navigate(['/desktop/analysis/config']);
    }
  }

  goToDownload() {
    this.router.navigate(['/desktop/datasets/get']);
  }
}
