import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { DatasetApiService } from './dataset-api.service';

describe('DatasetApiService', () => {
  let service: DatasetApiService;
  let httpTestingController: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        DatasetApiService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ]
    });

    service = TestBed.inject(DatasetApiService);
    httpTestingController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTestingController.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
    expect(service.downloadProgress()).toBeNull();
  });

  it('should fetch registry via HTTP when in web mode', async () => {
    const mockRegistry = [
      {
        id: 'censo-2023',
        sourceName: 'Censo Escolar',
        groupName: 'censo_escolar',
        year: '2023',
        path: '/data/censo-2023.zip',
        fileSize: 1024,
        status: 'completed',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z'
      }
    ];

    const promise = service.getRegistry();
    const req = httpTestingController.expectOne('data/datasets-registry.json');
    expect(req.request.method).toBe('GET');
    req.flush(mockRegistry);

    const registry = await promise;
    expect(registry.length).toBe(1);
    expect(registry[0].id).toBe('censo-2023');
  });

  it('should handle HTTP error gracefully when fetching registry in web mode', async () => {
    const promise = service.getRegistry();
    const req = httpTestingController.expectOne('data/datasets-registry.json');
    req.error(new ProgressEvent('Network error'));

    const registry = await promise;
    expect(registry).toEqual([]);
  });

  it('should throw error when downloading dataset in web mode', async () => {
    await expectAsync(
      service.downloadDataset('http://example.com/data.zip', {
        titulo: 'Test Dataset',
        tituloCurto: 'Test',
        grupo: 'test',
        formato: 'csv',
        ano: '2023',
      })
    ).toBeRejectedWithError(/Download de datasets não é suportado no modo Web/);
  });
});
