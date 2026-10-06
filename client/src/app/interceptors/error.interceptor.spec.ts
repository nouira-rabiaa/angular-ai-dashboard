import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors, HttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { errorInterceptor } from './error.interceptor';
import { ErrorService } from '../services/error.service';

describe('ErrorInterceptor', () => {
  let httpClient: HttpClient;
  let httpTestingController: HttpTestingController;
  let errorService: ErrorService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        ErrorService
      ]
    });

    httpClient = TestBed.inject(HttpClient);
    httpTestingController = TestBed.inject(HttpTestingController);
    errorService = TestBed.inject(ErrorService);
  });

  afterEach(() => {
    // Vérifie qu'il ne reste pas de requêtes HTTP en suspens
    httpTestingController.verify();
  });

  it('should catch a 500 error and trigger the ErrorService', () => {
    const showErrorSpy = jest.spyOn(errorService, 'showError');

    // Effectue une requête factice
    httpClient.get('/api/test').subscribe({
      error: (err) => {
        expect(err).toBeTruthy();
      }
    });

    // Simule une réponse serveur en erreur 500
    const req = httpTestingController.expectOne('/api/test');
    req.flush('Error 500', { status: 500, statusText: 'Internal Server Error' });

    // Vérifie que le service a bien capté le message d'erreur
    expect(showErrorSpy).toHaveBeenCalledWith('Erreur interne du serveur Node.js (500).');
  });
});