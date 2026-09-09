import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { IbgeMalhasApiService } from './ibge-malhas-api.service';

describe('IbgeMalhasApiService', () => {
  let service: IbgeMalhasApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        IbgeMalhasApiService,
      ],
    });

    service = TestBed.inject(IbgeMalhasApiService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should return mock overview when getStatus is called in web mode', async () => {
    const status = await service.getStatus();
    expect(status).toBeTruthy();
    expect(status.levels.length).toBeGreaterThan(0);
    expect(status.levels[0].id).toBe('pais');
  });

  it('should throw error when downloadMalha is called in web mode', async () => {
    await expectAsync(
      service.downloadMalha({
        level: 'pais',
        format: 'geojson',
        quality: 'minima',
      })
    ).toBeRejectedWithError(/Download de malhas do IBGE não é suportado no modo Web/);
  });

  it('should throw error when deleteMalha is called in web mode', async () => {
    await expectAsync(
      service.deleteMalha('pais', 'geojson', 'minima')
    ).toBeRejectedWithError(/Exclusão de malhas não é suportada no modo Web/);
  });

  it('should throw error when openFolder is called in web mode', async () => {
    await expectAsync(service.openFolder()).toBeRejectedWithError(
      /Abertura de pastas não é suportada no modo Web/
    );
  });
});
