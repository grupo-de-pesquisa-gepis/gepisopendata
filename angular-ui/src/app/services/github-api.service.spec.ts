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

  it('should return null when getGithubConfig is called in web mode', async () => {
    const config = await service.getGithubConfig();
    expect(config).toBeNull();
  });

  it('should throw error when testConnection is called in web mode', async () => {
    await expectAsync(service.testConnection('fake-token', 'owner', 'repo')).toBeRejectedWithError(
      /Teste de conexão do GitHub não suportado no modo Web/
    );
  });

  it('should return empty list when listPullRequests is called in web mode', async () => {
    const prs = await service.listPullRequests();
    expect(prs).toEqual([]);
  });
});
