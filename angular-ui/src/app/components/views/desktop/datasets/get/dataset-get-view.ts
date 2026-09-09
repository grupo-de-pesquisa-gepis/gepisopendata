import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDividerModule } from '@angular/material/divider';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatChipsModule } from '@angular/material/chips';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { message, open } from '@tauri-apps/plugin-dialog';
import { toSignal } from '@angular/core/rxjs-interop';
import { startWith } from 'rxjs/operators';
import { DatasetApiService } from '../../../../../services';
import { DatasetEntry, DatasetMetadata } from '../../../../../models';

@Component({
  selector: 'app-dataset-get-view',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    MatCheckboxModule,
    MatDividerModule,
    MatAutocompleteModule,
    MatChipsModule,
    MatButtonToggleModule,
  ],
  templateUrl: './dataset-get-view.html',
  styleUrl: './dataset-get-view.css',
})
export class DatasetGetView implements OnInit {
  private fb = inject(FormBuilder);
  public datasetApi = inject(DatasetApiService);

  sourceMode = signal<'url' | 'local'>('url');
  selectedLocalFiles = signal<string[]>([]);
  isProcessing = signal(false);

  // Entire registry data
  registry = signal<DatasetEntry[]>([]);

  // Unique groups for autocomplete
  allGroups = signal<string[]>([]);

  datasetForm = this.fb.group({
    grupo: [''],
    isSerieHistorica: [false],
    tituloCurto: ['', Validators.required],
    formato: ['csv', Validators.required],
    tituloLongo: ['', Validators.required],
    descricao: [''],
    orgaoEmissao: ['', Validators.required],
    dataReferencia: ['', Validators.required],
    frequencia: ['Anual'],
    licenca: [''],
    urls: [''],
    autor: [''],
    tags: [''],
  });

  // Track current group value
  grupoValue = toSignal(this.datasetForm.get('grupo')!.valueChanges.pipe(startWith('')));

  // Filtered groups for autocomplete
  filteredGroups = computed(() => {
    const filterValue = (this.grupoValue() || '').toLowerCase();
    return this.allGroups().filter((option) => option.toLowerCase().includes(filterValue));
  });

  // Datasets belonging to the CURRENTLY TYPED group
  datasetsInSelectedGroup = computed(() => {
    const currentGroup = this.grupoValue();
    if (!currentGroup) return [];

    return this.registry()
      .filter((item) => item.grupo === currentGroup)
      .map((item) => item.tituloCurto);
  });

  ngOnInit() {
    this.loadRegistry();
  }

  async loadRegistry() {
    try {
      const data = await this.datasetApi.getRegistry();
      this.registry.set(data);

      const groups = data
        .map((item) => item.grupo)
        .filter((value, index, self) => Boolean(value) && self.indexOf(value) === index);
      this.allGroups.set(groups);
    } catch (err) {
      console.warn('Could not load registry', err);
    }
  }

  async selectLocalFiles() {
    const format = this.datasetForm.get('formato')?.value;
    let extensions: string[] = [];

    switch (format) {
      case 'csv':
        extensions = ['csv'];
        break;
      case 'parquet':
        extensions = ['parquet'];
        break;
      case 'json':
        extensions = ['json'];
        break;
      case 'xlsx':
        extensions = ['xlsx', 'xls'];
        break;
      case 'zip':
        extensions = ['zip'];
        break;
      default:
        extensions = ['*'];
    }

    try {
      const selected = await open({
        multiple: true,
        filters: [
          {
            name: 'Arquivos de Dados',
            extensions: extensions,
          },
        ],
      });

      if (selected && Array.isArray(selected)) {
        this.selectedLocalFiles.set(selected);
      } else if (selected && typeof selected === 'string') {
        this.selectedLocalFiles.set([selected]);
      }
    } catch (err) {
      console.error('Error opening file dialog:', err);
    }
  }

  isSubmitDisabled(): boolean {
    if (this.datasetForm.invalid || this.isProcessing()) return true;

    if (this.sourceMode() === 'url') {
      const urls = this.datasetForm.get('urls')?.value;
      return !urls || urls.trim().length === 0;
    } else {
      return this.selectedLocalFiles().length === 0;
    }
  }

  async submitDataset() {
    if (this.isSubmitDisabled()) return;

    this.isProcessing.set(true);
    const { tituloCurto } = this.datasetForm.value;

    try {
      if (this.sourceMode() === 'url') {
        const { urls } = this.datasetForm.value;
        const urlList = urls!
          .split('\n')
          .map((u) => u.trim())
          .filter((u) => u.length > 0);

        for (const url of urlList) {
          await this.datasetApi.downloadDataset(url, this.datasetForm.value as DatasetMetadata);
        }
      } else {
        await this.datasetApi.importLocalDataset(
          this.selectedLocalFiles(),
          this.datasetForm.value as DatasetMetadata
        );
      }

      const actionText = this.sourceMode() === 'url' ? 'baixado' : 'importado';
      await message(`Conjunto de dados "${tituloCurto}" registrado e ${actionText} com sucesso!`, {
        title: 'Sucesso',
        kind: 'info',
      });

      // Refresh registry and groups
      await this.loadRegistry();

      // Reset form and selection
      this.datasetForm.reset({
        frequencia: 'Anual',
        isSerieHistorica: false,
        grupo: '',
        formato: 'csv',
      });
      this.selectedLocalFiles.set([]);
    } catch (err) {
      console.error('Process error:', err);
      await message(`Erro no processamento: ${err}`, {
        title: 'Erro',
        kind: 'error',
      });
    } finally {
      this.isProcessing.set(false);
    }
  }
}
