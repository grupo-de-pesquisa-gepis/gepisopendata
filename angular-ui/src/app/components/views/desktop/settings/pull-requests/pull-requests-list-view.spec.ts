import { ComponentFixture, TestBed } from '@angular/core/testing';
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
          title: 'Adicionar Censo 2023',
          state: 'open',
          htmlUrl: 'https://github.com/gepis/gepisopendata/pull/101',
          userLogin: 'colaborador1',
          createdAt: '2026-09-01T12:00:00Z',
          isDraft: false,
        },
        {
          id: 2,
          number: 102,
          title: 'Análise de Desempenho ENEM',
          state: 'closed',
          htmlUrl: 'https://github.com/gepis/gepisopendata/pull/102',
          userLogin: 'colaborador2',
          createdAt: '2026-09-02T14:00:00Z',
          mergedAt: '2026-09-03T10:00:00Z',
          isDraft: false,
        },
      ])
    );

    await TestBed.configureTestingModule({
      imports: [PullRequestsListView],
      providers: [
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

  it('should load pull requests on init', async () => {
    await fixture.whenStable();
    expect(githubApiSpy.getGithubConfig).toHaveBeenCalled();
    expect(githubApiSpy.listPullRequests).toHaveBeenCalledWith('all');
    expect(component.pullRequests().length).toBe(2);
    expect(component.openCount()).toBe(1);
    expect(component.closedCount()).toBe(1);
  });

  it('should filter pull requests by state', async () => {
    await fixture.whenStable();
    component.onFilterStateChange('open');
    expect(component.filteredPullRequests().length).toBe(1);
    expect(component.filteredPullRequests()[0].number).toBe(101);

    component.onFilterStateChange('closed');
    expect(component.filteredPullRequests().length).toBe(1);
    expect(component.filteredPullRequests()[0].number).toBe(102);
  });

  it('should filter pull requests by search query', async () => {
    await fixture.whenStable();
    component.searchQuery.set('ENEM');
    expect(component.filteredPullRequests().length).toBe(1);
    expect(component.filteredPullRequests()[0].title).toContain('ENEM');
  });
});
