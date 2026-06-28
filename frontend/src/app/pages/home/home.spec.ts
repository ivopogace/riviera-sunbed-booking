import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { environment } from '../../../environments/environment';
import { Home } from './home';

describe('Home', () => {
  let component: Home;
  let fixture: ComponentFixture<Home>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Home],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(Home);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should create', () => {
    httpMock.expectOne(`${environment.apiBaseUrl}/actuator/health`).flush({ status: 'UP' });
    expect(component).toBeTruthy();
  });

  it('should render the placeholder home heading', () => {
    httpMock.expectOne(`${environment.apiBaseUrl}/actuator/health`).flush({ status: 'UP' });
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Riviera — coming soon');
  });

  it('should render the backend status from the health probe', async () => {
    httpMock.expectOne(`${environment.apiBaseUrl}/actuator/health`).flush({ status: 'UP' });
    await fixture.whenStable();
    const status = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="backend-status"]');
    expect(status?.textContent).toContain('UP');
  });

  it('links to the demo venue map', async () => {
    httpMock.expectOne(`${environment.apiBaseUrl}/actuator/health`).flush({ status: 'UP' });
    fixture.detectChanges();
    await fixture.whenStable();
    const link = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="demo-venue-link"]');
    expect(link?.getAttribute('href')).toBe('/venues/1');
  });
});
