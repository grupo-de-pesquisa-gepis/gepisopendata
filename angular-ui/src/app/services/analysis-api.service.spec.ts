import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { AnalysisApiService } from './analysis-api.service';

describe('AnalysisApiService', () => {
  let service: AnalysisApiService;
  let httpTestingController: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        AnalysisApiService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ]
    });

    service = TestBed.inject(AnalysisApiService);
    httpTestingController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTestingController.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should fetch published analyses from registry and json files in web mode', async () => {
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

    const mockAnalysis = {
      id: 'analysis-1',
      name: 'Análise Teste',
      groupName: 'censo_escolar',
      variables: [],
      createdAt: '2026-01-01T00:00:00Z',
      publishedArtifacts: []
    };

    const promise = service.getAnalyses();

    // Registry call
    const regReq = httpTestingController.expectOne('data/datasets-registry.json');
    expect(regReq.request.method).toBe('GET');
    regReq.flush(mockRegistry);

    // After resolving registry, it fetches analysis configs for the group
    await Promise.resolve(); // flush microtask
    const analysisReq = httpTestingController.expectOne('data/published_analyses/censo_escolar/analyses.json');
    expect(analysisReq.request.method).toBe('GET');
    analysisReq.flush([mockAnalysis]);

    const result = await promise;
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('analysis-1');
  });

  it('should throw when running ETL in web mode', async () => {
    await expectAsync(
      service.runEtl('censo_escolar', ['NU_ANO_CENSO'])
    ).toBeRejectedWithError(/Processamento ETL não é suportado no modo Web/);
  });
});
