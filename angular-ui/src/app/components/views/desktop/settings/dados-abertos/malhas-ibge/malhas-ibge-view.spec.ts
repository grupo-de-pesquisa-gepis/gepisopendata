import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MalhasIbgeView } from './malhas-ibge-view';
import { IbgeMalhasApiService } from '../../../../../../services';
import { IbgeMalhasOverview } from '../../../../../../models';

describe('MalhasIbgeView', () => {
  let component: MalhasIbgeView;
  let fixture: ComponentFixture<MalhasIbgeView>;
  let ibgeApiSpy: jasmine.SpyObj<IbgeMalhasApiService>;

  const mockOverview: IbgeMalhasOverview = {
    levels: [
      {
        id: 'pais',
        name: 'País (Brasil)',
        description: 'Contorno territorial completo do Brasil',
        packageName: 'BR_Pais_2024',
        expectedFeatures: 1,
        geojsonFiles: [
          {
            format: 'geojson',
            quality: 'minima',
            fileName: 'BR_Pais_2024_minima.geojson',
            filePath: '/data/ibge_malhas/geojsonfiles/BR_Pais_2024_minima.geojson',
            sizeBytes: 15360,
            exists: true,
            isExtracted: false,
          },
          {
            format: 'geojson',
            quality: 'intermediaria',
            fileName: 'BR_Pais_2024_intermediaria.geojson',
            filePath: '/data/ibge_malhas/geojsonfiles/BR_Pais_2024_intermediaria.geojson',
            sizeBytes: 45000,
            exists: false,
            isExtracted: false,
          },
          {
            format: 'geojson',
            quality: 'maxima',
            fileName: 'BR_Pais_2024_maxima.geojson',
            filePath: '/data/ibge_malhas/geojsonfiles/BR_Pais_2024_maxima.geojson',
            sizeBytes: 120000,
            exists: false,
            isExtracted: false,
          },
        ],
        shapefile: {
          format: 'shapefile',
          fileName: 'BR_Pais_2024.zip',
          filePath: '/data/ibge_malhas/zipfiles/BR_Pais_2024.zip',
          sizeBytes: 1048576,
          exists: true,
          isExtracted: true,
        },
      },
      {
        id: 'uf',
        name: 'Unidades da Federação',
        description: '26 Estados e Distrito Federal',
        packageName: 'BR_UF_2024',
        expectedFeatures: 27,
        geojsonFiles: [
          {
            format: 'geojson',
            quality: 'minima',
            fileName: 'BR_UF_2024_minima.geojson',
            filePath: '/data/ibge_malhas/geojsonfiles/BR_UF_2024_minima.geojson',
            sizeBytes: 118000,
            exists: false,
            isExtracted: false,
          },
        ],
        shapefile: {
          format: 'shapefile',
          fileName: 'BR_UF_2024.zip',
          filePath: '/data/ibge_malhas/zipfiles/BR_UF_2024.zip',
          sizeBytes: 2500000,
          exists: false,
          isExtracted: false,
        },
      },
    ],
    totalSizeBytes: 1063936,
    totalFilesCount: 2,
    malhasDir: '/app/data/ibge_malha_municipal',
  };

  beforeEach(async () => {
    ibgeApiSpy = jasmine.createSpyObj('IbgeMalhasApiService', [
      'getStatus',
      'downloadMalha',
      'deleteMalha',
      'openFolder',
    ]);
    (ibgeApiSpy as any).downloadProgress = signal(null);
    ibgeApiSpy.getStatus.and.returnValue(Promise.resolve(mockOverview));
    ibgeApiSpy.downloadMalha.and.returnValue(Promise.resolve('/path/to/downloaded'));
    ibgeApiSpy.deleteMalha.and.returnValue(Promise.resolve(true));
    ibgeApiSpy.openFolder.and.returnValue(Promise.resolve());

    await TestBed.configureTestingModule({
      imports: [MalhasIbgeView, NoopAnimationsModule],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: IbgeMalhasApiService, useValue: ibgeApiSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MalhasIbgeView);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should load status on init', async () => {
    await fixture.whenStable();
    expect(ibgeApiSpy.getStatus).toHaveBeenCalled();
    expect(component.overview()).toEqual(mockOverview);
    expect(component.totalFiles()).toBe(2);
    expect(component.filteredLevels().length).toBe(2);
  });

  it('should filter levels by search query', async () => {
    await fixture.whenStable();
    component.searchQuery.set('Federação');
    expect(component.filteredLevels().length).toBe(1);
    expect(component.filteredLevels()[0].id).toBe('uf');
  });

  it('should trigger GeoJSON download when downloadGeojson is called', async () => {
    await fixture.whenStable();
    await component.downloadGeojson('pais', 'minima');
    expect(ibgeApiSpy.downloadMalha).toHaveBeenCalledWith({
      level: 'pais',
      format: 'geojson',
      quality: 'minima',
      enrichNames: true,
    });
  });

  it('should trigger Shapefile download when downloadShapefile is called', async () => {
    await fixture.whenStable();
    await component.downloadShapefile('uf');
    expect(ibgeApiSpy.downloadMalha).toHaveBeenCalledWith({
      level: 'uf',
      format: 'shapefile',
      extractZip: true,
    });
  });

  it('should format bytes correctly', () => {
    expect(component.formatBytes(0)).toBe('0 B');
    expect(component.formatBytes(1024)).toBe('1 KB');
    expect(component.formatBytes(1048576)).toBe('1 MB');
  });
});
