import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { GithubApiService } from './github-api.service';

describe('GithubApiService', () => {
  let service: GithubApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        GithubApiService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ]
    });

    service = TestBed.inject(GithubApiService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should return null or default when getGithubConfig is called in web mode', async () => {
    const config = await service.getGithubConfig();
    expect(config).toBeNull();
  });

  it('should return default connection failure in web mode', async () => {
    const result = await service.testConnection('fake-token', 'owner', 'repo');
    expect(result.success).toBeFalse();
    expect(result.message).toContain('não é suportado no modo Web');
  });
});
