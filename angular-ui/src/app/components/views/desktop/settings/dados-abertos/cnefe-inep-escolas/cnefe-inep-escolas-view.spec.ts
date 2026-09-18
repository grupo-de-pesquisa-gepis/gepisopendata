import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { CnefeInepEscolasView } from './cnefe-inep-escolas-view';
import { IbgeCnefeApiService } from '../../../../../../services';
import { CnefeSchoolComparisonResult, CnefeSchoolSummary } from '../../../../../../models';

describe('CnefeInepEscolasView', () => {
  let component: CnefeInepEscolasView;
  let fixture: ComponentFixture<CnefeInepEscolasView>;
  let cnefeApiSpy: jasmine.SpyObj<IbgeCnefeApiService>;

  const mockSummary: CnefeSchoolSummary = {
    anoCenso: '2024',
    cnefeAno: '2022',
    datasetOrigemCenso: 'Microdados da Educação Básica 2024 (INEP)',
    totalEscolas: 100,
    totalGeorreferenciadas: 85,
    percGeorreferenciadas: 85.0,
    altaConfianca: 70,
    percAlta: 70.0,
    mediaConfianca: 10,
    percMedia: 10.0,
    baixaConfianca: 5,
    percBaixa: 5.0,
    ambiguas: 5,
    percAmbiguas: 5.0,
    semCorrespondencia: 10,
    percSemCorrespondencia: 10.0,
    totalCnefeEnsino: 200,
    cnefeNaoCenso: 115,
    percCnefeNaoCenso: 57.5,
    ufsProcessadas: ['SP'],
    inepCensoDisponivel: true,
    cnefeDisponivel: true,
  };

  const mockQueryResult: CnefeSchoolComparisonResult = {
    summary: mockSummary,
    records: [
      {
        coEntidade: '35030806',
        noEntidade: 'ESCOLA HELEN KELLER',
        sgUf: 'SP',
        coUf: '35',
        noMunicipio: 'Adamantina',
        coMunicipio: '3500105',
        coCep: '17800000',
        dsEndereco: 'MARIO OLIVERO',
        nuEndereco: '122',
        noBairro: 'VILA CICMA',
        tpDependencia: '2',
        tpLocalizacao: '1',
        latitude: '-21.692973',
        longitude: '-51.068637',
        cnefeNvGeoCoord: '1',
        cnefeDscEstabelecimento: 'ESCOLA HELEN KELLER',
        statusGeolocalizacao: 'alta',
        confiancaNome: '1.000',
      },
    ],
    totalRecords: 1,
    page: 1,
    pageSize: 50,
  };

  beforeEach(async () => {
    cnefeApiSpy = jasmine.createSpyObj('IbgeCnefeApiService', [
      'getComparisonSummary',
      'querySchoolsComparison',
      'runMatching',
      'openFolder',
    ]);
    (cnefeApiSpy as any).downloadProgress = signal(null);
    (cnefeApiSpy as any).matchProgress = signal(null);
    cnefeApiSpy.getComparisonSummary.and.returnValue(Promise.resolve(mockSummary));
    cnefeApiSpy.querySchoolsComparison.and.returnValue(Promise.resolve(mockQueryResult));
    cnefeApiSpy.runMatching.and.returnValue(Promise.resolve(mockSummary));
    cnefeApiSpy.openFolder.and.returnValue(Promise.resolve());

    await TestBed.configureTestingModule({
      imports: [CnefeInepEscolasView, NoopAnimationsModule],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: IbgeCnefeApiService, useValue: cnefeApiSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CnefeInepEscolasView);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should load summary and records on init', async () => {
    await fixture.whenStable();
    expect(cnefeApiSpy.getComparisonSummary).toHaveBeenCalled();
    expect(cnefeApiSpy.querySchoolsComparison).toHaveBeenCalled();
    expect(component.summary()).toEqual(mockSummary);
    expect(component.records().length).toBe(1);
    expect(component.totalRecords()).toBe(1);
  });

  it('should trigger runReprocess', async () => {
    await fixture.whenStable();
    await component.runReprocess();
    expect(cnefeApiSpy.runMatching).toHaveBeenCalled();
  });

  it('should return correct status classes and labels', () => {
    expect(component.getStatusClass('alta')).toBe('status-alta');
    expect(component.getStatusClass('sem_correspondencia')).toBe('status-sem-corresp');
    expect(component.getStatusLabel('alta')).toBe('Alta Confiança');
    expect(component.getStatusLabel('ambiguo')).toBe('Ambíguo');
  });
});
