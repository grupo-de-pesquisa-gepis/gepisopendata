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
import { invoke } from '@tauri-apps/api/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DatasetStateService } from '../../../../../services/dataset-state.service';

interface Dataset {
  id: string;
  grupo: string;
  tituloCurto: string;
  tituloLongo: string;
  orgaoEmissao: string;
  dataReferencia: string;
  exists?: boolean;
  localPath: string;
}

interface DatasetGroup {
  name: string;
  items: Dataset[];
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
  template: `
    <div class="container">
      <div class="header">
        <h1>Selecionar Fonte de Dados</h1>
        <p>Escolha uma coleção ou grupo de dados para iniciar a análise.</p>
      </div>

      <div class="selection-status" *ngIf="selectedGroupName()">
        <mat-icon>check_circle</mat-icon>
        <span>Grupo Selecionado: <strong>{{ selectedGroupName() || 'Nenhum' }}</strong></span>
      </div>

      <mat-card appearance="outlined">
        <mat-card-content>
          @if (groupedDatasets().length === 0) {
            <div class="empty-state">
              <mat-icon>storage</mat-icon>
              <p>Nenhum dataset encontrado no registro.</p>
              <button mat-flat-button color="primary" (click)="goToDownload()">
                Ir para Downloads
              </button>
            </div>
          } @else {
            <div class="group-list">
              @for (group of groupedDatasets(); track group.name) {
                <div class="group-item" [class.selected]="selectedGroupName() === group.name"
                     [class.disabled]="!group.isAvailable">
                  
                  <div class="group-header">
                    <mat-radio-button [value]="group.name" 
                                     [checked]="selectedGroupName() === group.name"
                                     [disabled]="!group.isAvailable"
                                     (change)="selectGroup(group.name)">
                      <span class="group-name">{{ group.name || 'Sem Grupo (Datasets Avulsos)' }}</span>
                    </mat-radio-button>
                    
                    @if (!group.isAvailable) {
                      <mat-chip class="warn-chip" highlighted color="warn">
                        <mat-icon>warning</mat-icon> Arquivos Faltando
                      </mat-chip>
                    }
                  </div>

                  <div class="group-details">
                    <div class="items-count">{{ group.items.length }} dataset(s) nesta coleção:</div>
                    <div class="dataset-pills">
                      @for (item of group.items; track item.id) {
                        <span class="dataset-pill" [class.missing]="item.exists === false">
                          {{ item.tituloCurto }} ({{ item.dataReferencia }})
                        </span>
                      }
                    </div>
                  </div>
                </div>
              }
            </div>
          }
        </mat-card-content>

        <mat-card-actions align="end" *ngIf="groupedDatasets().length > 0">
          <button mat-raised-button color="primary" 
                  [disabled]="!selectedGroupName()" 
                  (click)="confirmSelection()">
            Confirmar Seleção do Grupo
            <mat-icon>arrow_forward</mat-icon>
          </button>
        </mat-card-actions>
      </mat-card>
    </div>
  `,
  styles: [`
    .container { padding: 24px; max-width: 900px; margin: 0 auto; }
    .header { margin-bottom: 24px; }
    .header h1 { margin: 0; color: #3f51b5; }
    
    .selection-status {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 16px;
      padding: 12px 16px;
      background-color: #e8eaf6;
      color: #3f51b5;
      border-radius: 8px;
      border-left: 4px solid #3f51b5;
    }

    .empty-state { text-align: center; padding: 40px; }
    .empty-state mat-icon { font-size: 48px; width: 48px; height: 48px; color: #ccc; }

    .group-list { display: flex; flex-direction: column; gap: 12px; }
    
    .group-item {
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 16px;
      transition: all 0.2s ease;
    }

    .group-item.selected {
      border-color: #3f51b5;
      background-color: rgba(63, 81, 181, 0.02);
      box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    }

    .group-item.disabled { opacity: 0.7; background-color: #fafafa; }

    .group-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .group-name { font-weight: 500; font-size: 1.1rem; }

    .group-details { padding-left: 32px; }
    .items-count { font-size: 0.8rem; color: #777; margin-bottom: 8px; }

    .dataset-pills { display: flex; flex-wrap: wrap; gap: 8px; }
    .dataset-pill {
      font-size: 0.75rem;
      padding: 2px 8px;
      background: #f0f0f0;
      border-radius: 12px;
      color: #555;
    }

    .dataset-pill.missing {
      background: #ffebee;
      color: #c62828;
      text-decoration: line-through;
    }

    .warn-chip { height: 24px; font-size: 0.7rem; }
    .warn-chip mat-icon { font-size: 14px; width: 14px; height: 14px; }

    mat-card-actions { padding: 16px; border-top: 1px solid #eee; }
  `]
})
export class DatasetSelectView implements OnInit {
  private router = inject(Router);
  private stateService = inject(DatasetStateService);
  
  datasets = signal<Dataset[]>([]);
  selectedGroupName = signal<string | null>(this.stateService.getSelectedGroup());

  groupedDatasets = computed(() => {
    const data = this.datasets();
    const groupsMap = data.reduce((acc: any, item) => {
      const groupName = item.grupo || '';
      if (!acc[groupName]) acc[groupName] = [];
      acc[groupName].push(item);
      return acc;
    }, {});

    return Object.keys(groupsMap).sort().map(name => {
      const items = groupsMap[name];
      // A group is available only if ALL its items exist on disk
      const isAvailable = items.every((item: Dataset) => item.exists !== false);
      
      return {
        name,
        items,
        isAvailable
      };
    });
  });

  ngOnInit() {
    this.loadDatasets();
  }

  async loadDatasets() {
    try {
      const data = await invoke<Dataset[]>('get_registry');
      
      const datasetsWithStatus = await Promise.all(data.map(async (item) => {
        const pathExists = await invoke<boolean>('check_path_exists', { path: item.localPath });
        return { ...item, exists: pathExists };
      }));

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
    const group = this.groupedDatasets().find(g => g.name === groupName);
    
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
