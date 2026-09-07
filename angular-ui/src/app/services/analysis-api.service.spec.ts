import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { AnalysisApiService } from './analysis-api.service';

describe('AnalysisApiService', () => {
  let service: AnalysisApiService;
  let httpTestingController: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
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

  it('should fetch published analyses from json in web mode', async () => {
    const mockAnalysis = {
      id: 'analysis-1',
      name: 'Análise Teste',
      groupName: 'censo_escolar',
      variables: [],
      createdAt: '2026-01-01T00:00:00Z',
      publishedArtifacts: []
    };

    const promise = service.getAnalyses();

    const analysisReq = httpTestingController.expectOne('data/analyses-history.json');
    expect(analysisReq.request.method).toBe('GET');
    analysisReq.flush([mockAnalysis]);

    const result = await promise;
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('analysis-1');
  });

  it('should throw when running ETL in web mode', async () => {
    await expectAsync(
      service.runEtl('censo_escolar', ['dados.csv'], ['NU_ANO_CENSO'])
    ).toBeRejectedWithError(/ETL não disponível em modo Web/);
  });
});
