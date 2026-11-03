import { ErrorService } from '../../services/error.service';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { ApiService } from '../../services/api.service';
import { ChatComponent } from './chat.component';

describe('ChatComponent', () => {
  let sendChatPrompt: jest.Mock;
  let uploadDocument: jest.Mock;

  beforeEach(async () => {
    sendChatPrompt = jest.fn().mockReturnValue(of({ reply: 'Default answer.' }));
    uploadDocument = jest.fn();
    await TestBed.configureTestingModule({
      imports: [ChatComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ApiService, useValue: { sendChatPrompt, uploadDocument } }
      ]
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(ChatComponent);
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });

  it('keeps the document picker keyboard accessible and describes lexical indexing honestly', () => {
    const fixture = TestBed.createComponent(ChatComponent);fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.accept).toBe('.pdf,.txt,.csv');expect(input.classList.contains('hidden')).toBe(false);
    expect(input.getAttribute('aria-label')).toContain('PDF, TXT ou CSV');
    expect(fixture.nativeElement.querySelector('textarea').getAttribute('aria-label')).toBeTruthy();
    fixture.componentInstance.isLoading.set(true);fixture.componentInstance.isUploadingDoc.set(true);fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('indexation lexicale FTS5');expect(text).not.toMatch(/vectorisation|embedding/);
    expect(uploadDocument).not.toHaveBeenCalled();
  });
  it('reports a failed import through the existing notification service without a browser alert', () => {
    const fixture = TestBed.createComponent(ChatComponent);uploadDocument.mockReturnValue(throwError(() => new Error('offline')));
    const alert = jest.spyOn(window, 'alert').mockImplementation(() => {});
    fixture.componentInstance.onFileSelected({ target: { files: [new File(['sample'], 'sample.txt')] } });
    expect(fixture.componentInstance.isUploadingDoc()).toBe(false);
    expect(TestBed.inject(ErrorService).currentError()).toContain('Échec du traitement');expect(alert).not.toHaveBeenCalled();alert.mockRestore();
  });
  it('keeps the shared prompt inside the conversation and submits through the rendered send control', async () => {
    const fixture = TestBed.createComponent(ChatComponent);fixture.detectChanges();await fixture.whenStable();
    expect(sendChatPrompt).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.generator-empty').textContent).toContain('Aucun appel IA');
    const thread = fixture.nativeElement.querySelector('.generator-thread') as HTMLElement;
    const input = thread.querySelector('textarea') as HTMLTextAreaElement;
    expect(thread.querySelector('.generator-composer')?.contains(input)).toBe(true);
    expect(fixture.nativeElement.querySelector('.generator-documents textarea')).toBeNull();
    expect(input.rows).toBe(4);expect(input.getAttribute('aria-describedby')).toBe('generator-prompt-help');
    const pending = new Subject<any>();sendChatPrompt.mockReturnValue(pending);
    input.value = '  Une question documentaire  ';input.dispatchEvent(new Event('input'));fixture.detectChanges();await fixture.whenStable();
    (thread.querySelector('.generator-send') as HTMLButtonElement).click();fixture.detectChanges();
    expect(sendChatPrompt).toHaveBeenCalledWith('Une question documentaire', null);
    expect((thread.querySelector('.generator-send') as HTMLButtonElement).disabled).toBe(true);
    expect(fixture.componentInstance.messages()[0].text).toBe('Une question documentaire');
    pending.next({ reply: 'Réponse réelle du service simulé.' });fixture.detectChanges();
    expect(thread.textContent).toContain('Réponse réelle du service simulé.');
    expect(thread.querySelector('.generator-empty')).toBeNull();
  });

  it('preserves Enter activation and routes a form request to the existing form generator only', async () => {
    const generate = jest.fn().mockReturnValue(of({ title: 'Formulaire de test', fields: [{ name: 'subject', label: 'Objet', type: 'text', required: true }] }));
    TestBed.inject(ApiService).generateFormSchema = generate;
    const fixture = TestBed.createComponent(ChatComponent);fixture.detectChanges();await fixture.whenStable();
    const input = fixture.nativeElement.querySelector('#generator-prompt') as HTMLTextAreaElement;
    input.value = 'Créer un formulaire de contact';input.dispatchEvent(new Event('input'));fixture.detectChanges();await fixture.whenStable();
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));fixture.detectChanges();
    expect(generate).toHaveBeenCalledTimes(1);expect(generate).toHaveBeenCalledWith('Créer un formulaire de contact');
    expect(sendChatPrompt).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.generator-messages app-dynamic-form input')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Formulaire de test');
  });

  it('keeps the message region focusable and document controls functional after moving the composer', () => {
    const fixture = TestBed.createComponent(ChatComponent);fixture.detectChanges();
    const region = fixture.nativeElement.querySelector('[aria-label="Messages et citations"]') as HTMLElement;
    region.focus();expect(document.activeElement).toBe(region);
    const controls = Array.from(fixture.nativeElement.querySelectorAll('.generator-documents button')) as HTMLButtonElement[];
    const active = controls.find(button => button.textContent?.trim() === 'Document actif')!;
    const all = controls.find(button => button.textContent?.trim() === 'Tous les documents')!;
    expect(active.disabled).toBe(true);expect(all.getAttribute('aria-pressed')).toBe('true');
    fixture.componentInstance.activeDocumentId.set(12);fixture.detectChanges();active.click();fixture.detectChanges();
    expect(fixture.componentInstance.retrievalScope()).toBe('active');expect(active.getAttribute('aria-pressed')).toBe('true');
    all.click();expect(fixture.componentInstance.retrievalScope()).toBe('all');
  });

  it('renders real citation metadata and distinguishes cited from retrieved-only sources', () => {
    sendChatPrompt.mockReturnValue(of({
      reply: 'The site opened in 1984 [S1].',
      sources: [
        {
          chunkId: 7,
          documentId: 2,
          filename: 'museum-history.pdf',
          label: 'S1',
          pageNumber: 4,
          excerpt: 'The site opened in 1984.',
          cited: true
        },
        {
          chunkId: 8,
          documentId: 3,
          filename: 'annual-report.pdf',
          label: 'S2',
          excerpt: 'Attendance increased the following year.',
          cited: false
        }
      ],
      citationValidation: {
        validLabels: ['S1'],
        invalidLabels: [],
        sourceIdentityValidated: true,
        factualEntailmentValidated: false
      }
    }));
    const fixture = TestBed.createComponent(ChatComponent);
    const component = fixture.componentInstance;
    component.userPrompt.set('When did the site open?');

    component.sendMessage();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('[S1]');
    expect(text).toContain('museum-history.pdf');
    expect(text).toContain('Page 4');
    expect(text).toContain('The site opened in 1984.');
    expect(text).toContain('Cité');
    expect(text).toContain('Retrouvé, non cité');
    expect(text).toContain('Attendance increased the following year.');
    expect(text).toContain('ne garantissent pas que chaque affirmation est étayée');
  });

  it('renders a normalized citation answer with the backend cited status', () => {
    sendChatPrompt.mockReturnValue(of({
      reply: 'The expected value is 42 [S1].',
      sources: [{
        chunkId: 21,
        documentId: 5,
        filename: 'jest-tests.pdf',
        label: 'S1',
        excerpt: 'calculateTotal(items) returns 42.',
        cited: true
      }],
      citationValidation: {
        validLabels: ['S1'],
        invalidLabels: [],
        sourceIdentityValidated: true,
        factualEntailmentValidated: false
      }
    }));
    const fixture = TestBed.createComponent(ChatComponent);
    const component = fixture.componentInstance;
    component.userPrompt.set('What is the expected value?');

    component.sendMessage();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('The expected value is 42 [S1].');
    expect(fixture.nativeElement.textContent).toContain('Cité');
    expect(fixture.nativeElement.textContent).not.toContain('Retrouvé, non cité');
  });

  it('shows no-source and unmatched-label states and omits unavailable page numbers', () => {
    sendChatPrompt.mockReturnValue(of({
      reply: 'No document passage supports this answer [S8].',
      sources: [],
      citationValidation: {
        validLabels: [],
        invalidLabels: ['S8'],
        sourceIdentityValidated: true,
        factualEntailmentValidated: false
      }
    }));
    const fixture = TestBed.createComponent(ChatComponent);
    const component = fixture.componentInstance;
    component.userPrompt.set('Question without a match');

    component.sendMessage();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('ne dispose pas de source documentaire');
    expect(fixture.nativeElement.textContent).toContain('Labels de citation non reconnus : S8');

    sendChatPrompt.mockReturnValue(of({
      reply: 'A grounded answer [S1].',
      sources: [{
        chunkId: 9,
        documentId: 4,
        filename: 'notes.txt',
        label: 'S1',
        excerpt: 'Verified excerpt.',
        cited: true
      }]
    }));
    component.userPrompt.set('Ask about notes');
    component.sendMessage();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('notes.txt');
    expect(text).toContain('Verified excerpt.');
    expect(text).not.toContain('Page undefined');
  });

  it('supports older chat responses that omit all citation fields', () => {
    sendChatPrompt.mockReturnValue(of({ reply: 'Legacy server response.' }));
    const fixture = TestBed.createComponent(ChatComponent);
    const component = fixture.componentInstance;
    component.userPrompt.set('A legacy question');

    component.sendMessage();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Legacy server response.');
    expect(fixture.nativeElement.textContent).toContain('ne dispose pas de source documentaire');
  });

  it('uses the documentId returned from upload as the active retrieval scope', () => {
    uploadDocument.mockReturnValue(of({
      documentId: 31,
      filename: 'jest-guide.pdf',
      text: 'Expected value is 42.',
      characterCount: 21
    }));
    const fixture = TestBed.createComponent(ChatComponent);
    const component = fixture.componentInstance;
    const file = new File(['pdf bytes'], 'jest-guide.pdf', { type: 'application/pdf' });

    component.onFileSelected({ target: { files: [file] } });
    component.userPrompt.set('What is expected?');
    component.sendMessage();

    expect(component.activeDocumentId()).toBe(31);
    expect(component.retrievalScope()).toBe('active');
    expect(sendChatPrompt).toHaveBeenCalledWith('What is expected?', 31);
  });

  it('changes subsequent requests between selected-document and all-documents scope', () => {
    const fixture = TestBed.createComponent(ChatComponent);
    const component = fixture.componentInstance;
    component.activeDocumentId.set(12);
    component.setRetrievalScope('active');
    component.userPrompt.set('First question');
    component.sendMessage();

    component.setRetrievalScope('all');
    component.userPrompt.set('Second question');
    component.sendMessage();

    expect(sendChatPrompt.mock.calls).toEqual([
      ['First question', 12],
      ['Second question', null]
    ]);
  });

  it('renders actual per-request execution trace, usage, and estimated cost', () => {
    sendChatPrompt.mockReturnValue(of({
      reply: 'Answer [S1].',
      usage: { inputTokens: 40, outputTokens: 12, totalTokens: 52, source: 'provider' },
      estimatedCostUsd: 0.000022,
      currency: 'USD',
      pricingModelId: 'openai/gpt-oss-120b',
      pricingSource: 'configured',
      isEstimate: true,
      unavailableReason: null,
      executionTrace: {
        traceId: 'trace-test-123',
        status: 'success',
        totalDurationMs: 1615.7857499999955,
        steps: [
          { name: 'request-validation', status: 'success', durationMs: 0.2 },
          { name: 'sqlite-fts5-retrieval', status: 'success', durationMs: 4.625 },
          { name: 'context-preparation', status: 'success', durationMs: 0.4 },
          { name: 'groq-inference', status: 'success', durationMs: 1603.3111670000071 }
        ],
        retrieval: { strategy: 'sqlite-fts5', retrievedChunkCount: 1, scope: 'document', documentId: 31 },
        modelIdentifier: 'openai/gpt-oss-120b',
        timestamp: '2026-10-27T10:00:00.000Z'
      }
    }));
    const fixture = TestBed.createComponent(ChatComponent);
    const component = fixture.componentInstance;
    component.userPrompt.set('Request with telemetry');

    component.sendMessage();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Détails d’exécution');
    expect(text).toContain('success');
    expect(text).toContain('1,615.79 ms');
    expect(text).toContain('Recherche SQLite FTS5');
    expect(text).toContain('4.63 ms');
    expect(text).toContain('Inférence Groq');
    expect(text).toContain('1,603.31 ms');
    expect(text).toContain('40');
    expect(text).toContain('12');
    expect(text).toContain('52');
    expect(text).toContain('$0.00002200 USD');
    expect(text).toContain('non facturé');
    expect(text).toContain('openai/gpt-oss-120b');
    expect(text).toContain('1');
    expect(text).toContain('Document actif #31');
    expect(text).toContain('trace-test-123');
    const trace = component.messages().find(message => message.executionTrace)?.executionTrace;
    expect(trace?.totalDurationMs).toBe(1615.7857499999955);
    expect(trace?.steps[1].durationMs).toBe(4.625);
    expect(trace?.steps[3].durationMs).toBe(1603.3111670000071);
  });

  it('shows unavailable provider usage and pricing without inventing values', () => {
    sendChatPrompt.mockReturnValue(of({
      reply: 'Answer without provider usage.',
      usage: { inputTokens: null, outputTokens: null, totalTokens: null, source: 'unavailable' },
      estimatedCostUsd: null,
      currency: 'USD',
      pricingModelId: 'unknown-model',
      pricingSource: null,
      isEstimate: true,
      unavailableReason: 'provider_usage_unavailable',
      executionTrace: {
        traceId: 'trace-no-usage',
        status: 'no_match',
        totalDurationMs: 8,
        steps: [{ name: 'groq-inference', status: 'success', durationMs: 7 }],
        retrieval: { strategy: 'sqlite-fts5', retrievedChunkCount: 0, scope: 'all', documentId: null },
        modelIdentifier: 'unknown-model',
        timestamp: '2026-10-27T10:00:00.000Z'
      }
    }));
    const fixture = TestBed.createComponent(ChatComponent);
    const component = fixture.componentInstance;
    component.userPrompt.set('Question with no matches');

    component.sendMessage();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('ne dispose pas de source documentaire');
    expect(text).toContain('Indisponible');
    expect(text).toContain('Tous les documents');
    expect(text).not.toContain('$0.00000000 USD');
  });

  it('renders partial execution trace returned with an API error', () => {
    sendChatPrompt.mockReturnValue({
      subscribe: ({ error }: { error: (error: unknown) => void }) => error({
        error: {
          error: 'Chat request failed.',
          executionTrace: {
            traceId: 'trace-failed',
            status: 'error',
            totalDurationMs: 20,
            steps: [
              { name: 'request-validation', status: 'success', durationMs: 0.1 },
              { name: 'groq-inference', status: 'error', durationMs: 19 }
            ],
            retrieval: { strategy: 'sqlite-fts5', retrievedChunkCount: 1, scope: 'all', documentId: null },
            modelIdentifier: 'openai/gpt-oss-120b',
            timestamp: '2026-10-27T10:00:00.000Z'
          }
        }
      })
    });
    const fixture = TestBed.createComponent(ChatComponent);
    const component = fixture.componentInstance;
    component.userPrompt.set('Request that fails');

    component.sendMessage();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Chat request failed.');
    expect(text).toContain('trace-failed');
    expect(text).toContain('Inférence Groq');
    expect(text).toContain('error');
    expect(text).toContain('Indisponible');
  });
});