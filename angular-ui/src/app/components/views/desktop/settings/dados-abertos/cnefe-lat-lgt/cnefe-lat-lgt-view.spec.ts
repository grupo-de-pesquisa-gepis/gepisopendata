import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { CnefeLatLgtView } from './cnefe-lat-lgt-view';
import { IbgeCnefeApiService } from '../../../../../../services';
import { IbgeCnefeOverview } from '../../../../../../models';

describe('CnefeLatLgtView', () => {
  let component: CnefeLatLgtView;
  let fixture: ComponentFixture<CnefeLatLgtView>;
  let cnefeApiSpy: jasmine.SpyObj<IbgeCnefeApiService>;

  const mockOverview: IbgeCnefeOverview = {
    ufs: [
      {
        code: '35',
        sigla: 'SP',
        name: 'São Paulo',
        region: 'Sudeste',
        packageName: '35_SP',
        zipFileName: '35_SP.zip',
        zipFilePath: 'data/ibge_cnefe/zipfiles/35_SP.zip',
        zipSizeBytes: 1048576,
        zipExists: true,
        isExtracted: true,
        csvFileName: '35_SP.csv',
        csvFilePath: 'data/ibge_cnefe/zipfiles/35_SP/35_SP.csv',
        csvSizeBytes: 4194304,
        csvExists: true,
      },
      {
        code: '33',
        sigla: 'RJ',
        name: 'Rio de Janeiro',
        region: 'Sudeste',
        packageName: '33_RJ',
        zipFileName: '33_RJ.zip',
        zipFilePath: 'data/ibge_cnefe/zipfiles/33_RJ.zip',
        zipSizeBytes: 524288,
        zipExists: false,
        isExtracted: false,
        csvSizeBytes: 0,
        csvExists: false,
      },
    ],
    totalSizeBytes: 1048576,
    totalZipCount: 1,
    totalExtractedCount: 1,
    cnefeDir: '/app/data/ibge_cnefe/zipfiles',
  };

  beforeEach(async () => {
    cnefeApiSpy = jasmine.createSpyObj('IbgeCnefeApiService', [
      'getStatus',
      'downloadUf',
      'extractUf',
      'deleteUf',
      'openFolder',
    ]);
    (cnefeApiSpy as any).downloadProgress = signal(null);
    cnefeApiSpy.getStatus.and.returnValue(Promise.resolve(mockOverview));
    cnefeApiSpy.downloadUf.and.returnValue(Promise.resolve('/path/to/35_SP.zip'));
    cnefeApiSpy.extractUf.and.returnValue(Promise.resolve('/path/to/35_SP'));
    cnefeApiSpy.deleteUf.and.returnValue(Promise.resolve(true));
    cnefeApiSpy.openFolder.and.returnValue(Promise.resolve());

    await TestBed.configureTestingModule({
      imports: [CnefeLatLgtView, NoopAnimationsModule],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: IbgeCnefeApiService, useValue: cnefeApiSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CnefeLatLgtView);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should load status on init', async () => {
    await fixture.whenStable();
    expect(cnefeApiSpy.getStatus).toHaveBeenCalled();
    expect(component.overview()).toEqual(mockOverview);
    expect(component.totalUfs()).toBe(2);
    expect(component.downloadedCount()).toBe(1);
    expect(component.extractedCount()).toBe(1);
    expect(component.filteredUfs().length).toBe(2);
  });

  it('should filter UFs by search query', async () => {
    await fixture.whenStable();
    component.searchQuery.set('Rio');
    expect(component.filteredUfs().length).toBe(1);
    expect(component.filteredUfs()[0].sigla).toBe('RJ');
  });

  it('should trigger UF download when downloadUf is called', async () => {
    await fixture.whenStable();
    const uf = mockOverview.ufs[0];
    await component.downloadUf(uf);
    expect(cnefeApiSpy.downloadUf).toHaveBeenCalledWith({
      uf: 'SP',
      extractZip: true,
      force: false,
    });
  });

  it('should format bytes correctly', () => {
    expect(component.formatBytes(0)).toBe('0 B');
    expect(component.formatBytes(1024)).toBe('1 KB');
    expect(component.formatBytes(1048576)).toBe('1 MB');
  });
});
