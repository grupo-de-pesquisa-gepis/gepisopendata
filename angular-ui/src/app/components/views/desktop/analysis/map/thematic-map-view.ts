import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  AfterViewInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import * as L from 'leaflet';
import { IbgeMalhasApiService } from '../../../../../services/ibge-malhas-api.service';

interface LevelOption {
  id: string;
  name: string;
}

@Component({
  selector: 'app-thematic-map-view',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatSelectModule,
    MatFormFieldModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './thematic-map-view.html',
  styleUrl: './thematic-map-view.css',
})
export class ThematicMapView implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('mapContainer', { static: false }) mapContainer!: ElementRef<HTMLDivElement>;

  private malhasApi = inject(IbgeMalhasApiService);

  private map: L.Map | null = null;
  private geojsonLayer: L.GeoJSON | null = null;

  isLoading = signal<boolean>(false);
  selectedLevel = signal<string>('uf');
  featuresCount = signal<number>(0);
  minPercent = signal<number>(0);
  maxPercent = signal<number>(0);

  availableLevels: LevelOption[] = [
    { id: 'regioes', name: 'Grandes Regiões (5)' },
    { id: 'uf', name: 'Unidades da Federação (27)' },
    { id: 'intermediarias', name: 'Regiões Intermediárias (133)' },
    { id: 'microrregioes', name: 'Microrregiões (558)' },
  ];

  // Escala de cores (Choropleth - Blues)
  readonly colorScale = ['#eff3ff', '#bdd7e7', '#6baed6', '#3182bd', '#08519c'];

  ngOnInit(): void {}

  ngAfterViewInit(): void {
    this.initMap();
    this.loadLevelData(this.selectedLevel());
  }

  ngOnDestroy(): void {
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }

  private initMap(): void {
    if (!this.mapContainer?.nativeElement) return;

    this.map = L.map(this.mapContainer.nativeElement, {
      center: [-14.235, -51.9253], // Centro geográfico aproximado do Brasil
      zoom: 4,
      minZoom: 3,
      maxZoom: 12,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(this.map);
  }

  async onLevelChange(levelId: string): Promise<void> {
    this.selectedLevel.set(levelId);
    await this.loadLevelData(levelId);
  }

  recenterMap(): void {
    if (this.geojsonLayer && this.map && this.geojsonLayer.getBounds().isValid()) {
      this.map.fitBounds(this.geojsonLayer.getBounds(), { padding: [20, 20] });
    } else if (this.map) {
      this.map.setView([-14.235, -51.9253], 4);
    }
  }

  private async loadLevelData(levelId: string): Promise<void> {
    if (!this.map) return;

    this.isLoading.set(true);

    try {
      const result = await this.malhasApi.getGeoJsonData(levelId);
      const geojson = result.data;
      if (!geojson || !geojson.features) {
        throw new Error('Formato GeoJSON inválido recebido.');
      }

      this.featuresCount.set(geojson.features.length);

      // Calcular áreas aproximadas de cada polígono para percentual temático
      let totalArea = 0;
      const areas: number[] = [];

      for (const feature of geojson.features) {
        const approxArea = this.calculateFeatureApproxArea(feature);
        areas.push(approxArea);
        totalArea += approxArea;
      }

      const percents: number[] = areas.map((a) => (totalArea > 0 ? (a / totalArea) * 100 : 0));
      const minP = Math.min(...percents);
      const maxP = Math.max(...percents);

      this.minPercent.set(minP);
      this.maxPercent.set(maxP);

      // Limpar camada anterior se houver
      if (this.geojsonLayer) {
        this.map.removeLayer(this.geojsonLayer);
        this.geojsonLayer = null;
      }

      // Adicionar camada temática com estilo coroplético
      this.geojsonLayer = L.geoJSON(geojson, {
        style: (feature) => {
          const index = geojson.features.indexOf(feature!);
          const pct = percents[index] ?? 0;
          return {
            fillColor: this.getColorForPercent(pct, minP, maxP),
            weight: 1.2,
            opacity: 1,
            color: '#ffffff',
            dashArray: '',
            fillOpacity: 0.8,
          };
        },
        onEachFeature: (feature, layer) => {
          const index = geojson.features.indexOf(feature);
          const pct = percents[index] ?? 0;
          const props = feature.properties || {};
          const nome = props.nome || props.NM_UF || props.name || 'Área';
          const sigla = props.sigla || props.SIGLA_UF || '';
          const cod = props.codarea || props.CD_UF || '';

          const tooltipContent = `
            <strong>${nome} ${sigla ? '(' + sigla + ')' : ''}</strong><br/>
            ${cod ? 'Código: ' + cod + '<br/>' : ''}
            Proporção: <strong>${pct.toFixed(2)}%</strong>
          `;

          layer.bindTooltip(tooltipContent, {
            sticky: true,
            className: 'thematic-tooltip',
          });

          layer.on({
            mouseover: (e) => {
              const target = e.target;
              target.setStyle({
                weight: 2.5,
                color: '#222222',
                fillOpacity: 0.95,
              });
              if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
                target.bringToFront();
              }
            },
            mouseout: (e) => {
              this.geojsonLayer?.resetStyle(e.target);
            },
          });
        },
      }).addTo(this.map);

      if (this.geojsonLayer.getBounds().isValid()) {
        this.map.fitBounds(this.geojsonLayer.getBounds(), { padding: [20, 20] });
      }
    } catch (err) {
      console.error('Erro ao carregar malha temática:', err);
    } finally {
      this.isLoading.set(false);
    }
  }

  private getColorForPercent(value: number, min: number, max: number): string {
    if (max <= min) return this.colorScale[2];
    const ratio = (value - min) / (max - min);
    const index = Math.min(
      Math.floor(ratio * this.colorScale.length),
      this.colorScale.length - 1
    );
    return this.colorScale[index];
  }

  // Cálculo aproximado de área em coordenadas esféricas para o protótipo
  private calculateFeatureApproxArea(feature: any): number {
    if (!feature || !feature.geometry) return 0;
    const geom = feature.geometry;

    if (geom.type === 'Polygon') {
      return this.ringArea(geom.coordinates[0]);
    } else if (geom.type === 'MultiPolygon') {
      let sum = 0;
      for (const poly of geom.coordinates) {
        sum += this.ringArea(poly[0]);
      }
      return sum;
    }
    return 1;
  }

  private ringArea(coords: number[][]): number {
    if (!coords || coords.length < 3) return 0;
    let area = 0;
    for (let i = 0; i < coords.length - 1; i++) {
      const [x1, y1] = coords[i];
      const [x2, y2] = coords[i + 1];
      area += x1 * y2 - x2 * y1;
    }
    return Math.abs(area) / 2;
  }
}
