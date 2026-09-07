import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { PullRequestsListView } from './pull-requests-list-view';
import { GithubApiService } from '../../../../../services';
import { of } from 'rxjs';

describe('PullRequestsListView', () => {
  let component: PullRequestsListView;
  let fixture: ComponentFixture<PullRequestsListView>;
  let githubApiSpy: jasmine.SpyObj<GithubApiService>;

  beforeEach(async () => {
    githubApiSpy = jasmine.createSpyObj('GithubApiService', ['getGithubConfig', 'listPullRequests']);
    githubApiSpy.getGithubConfig.and.returnValue(
      Promise.resolve({
        username: 'test-user',
        token: 'test-token',
        owner: 'gepis',
        repo: 'gepisopendata',
      })
    );
    githubApiSpy.listPullRequests.and.returnValue(
      Promise.resolve([
        {
          id: 1,
          number: 101,
          title: '[Dataset | Censo Escolar] Adicionar dados 2023',
          state: 'open',
          htmlUrl: 'https://github.com/gepis/gepisopendata/pull/101',
          userLogin: 'colaborador1',
          createdAt: '2026-09-01T12:00:00Z',
          headRef: 'contrib/dataset/censo-escolar/dados-2023',
          baseRef: 'main',
          isDraft: false,
          labels: ['dataset', 'censo'],
        },
        {
          id: 2,
          number: 102,
          title: '[Análise | ENEM] Análise de Desempenho Regional',
          state: 'closed',
          htmlUrl: 'https://github.com/gepis/gepisopendata/pull/102',
          userLogin: 'colaborador2',
          createdAt: '2026-09-02T14:00:00Z',
          mergedAt: '2026-09-03T10:00:00Z',
          headRef: 'contrib/analise/enem/desempenho-regional',
          baseRef: 'main',
          isDraft: false,
          labels: ['analise', 'enem'],
        },
        {
          id: 3,
          number: 103,
          title: '[Sync | Análises] Sincronização de 3 análises',
          state: 'open',
          htmlUrl: 'https://github.com/gepis/gepisopendata/pull/103',
          userLogin: 'colaborador3',
          createdAt: '2026-09-04T16:00:00Z',
          headRef: 'contrib/sync/analises',
          baseRef: 'main',
          isDraft: false,
          labels: ['sync'],
        },
      ])
    );

    await TestBed.configureTestingModule({
      imports: [PullRequestsListView],
      providers: [
        provideZonelessChangeDetection(),
        { provide: GithubApiService, useValue: githubApiSpy },
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PullRequestsListView);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should load pull requests on init and compute category counts', async () => {
    await fixture.whenStable();
    expect(githubApiSpy.getGithubConfig).toHaveBeenCalled();
    expect(githubApiSpy.listPullRequests).toHaveBeenCalledWith('all');
    expect(component.pullRequests().length).toBe(3);
    expect(component.openCount()).toBe(2);
    expect(component.closedCount()).toBe(1);
    expect(component.datasetCount()).toBe(1);
    expect(component.analysisCount()).toBe(1);
    expect(component.syncCount()).toBe(1);
  });

  it('should filter pull requests by state', async () => {
    await fixture.whenStable();
    component.onFilterStateChange('open');
    expect(component.filteredPullRequests().length).toBe(2);

    component.onFilterStateChange('closed');
    expect(component.filteredPullRequests().length).toBe(1);
    expect(component.filteredPullRequests()[0].number).toBe(102);
  });

  it('should filter pull requests by category type', async () => {
    await fixture.whenStable();
    component.onFilterStateChange('all');

    component.onFilterTypeChange('analysis');
    expect(component.filteredPullRequests().length).toBe(1);
    expect(component.filteredPullRequests()[0].number).toBe(102);

    component.onFilterTypeChange('dataset');
    expect(component.filteredPullRequests().length).toBe(1);
    expect(component.filteredPullRequests()[0].number).toBe(101);

    component.onFilterTypeChange('sync');
    expect(component.filteredPullRequests().length).toBe(1);
    expect(component.filteredPullRequests()[0].number).toBe(103);
  });

  it('should extract category, group name and clean title correctly', async () => {
    await fixture.whenStable();
    const prAnalysis = component.pullRequests()[1];
    expect(component.getPrCategory(prAnalysis).type).toBe('analysis');
    expect(component.getPrGroupName(prAnalysis)).toBe('ENEM');
    expect(component.getCleanTitle(prAnalysis)).toBe('Análise de Desempenho Regional');

    const prDataset = component.pullRequests()[0];
    expect(component.getPrCategory(prDataset).type).toBe('dataset');
    expect(component.getPrGroupName(prDataset)).toBe('Censo Escolar');
    expect(component.getCleanTitle(prDataset)).toBe('Adicionar dados 2023');
  });

  it('should filter pull requests by search query (including group name)', async () => {
    await fixture.whenStable();
    component.searchQuery.set('Censo Escolar');
    expect(component.filteredPullRequests().length).toBe(1);
    expect(component.filteredPullRequests()[0].number).toBe(101);
  });
});
