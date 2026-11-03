import { provideUiI18nTesting } from '../../i18n/ui-i18n.testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { GuidedDemoComponent } from './guided-demo.component';
import { GUIDED_DEMO_STEPS } from './guided-demo.data';

describe('GuidedDemoComponent', () => {
  let fixture: ComponentFixture<GuidedDemoComponent>;
  let component: GuidedDemoComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GuidedDemoComponent],
      providers: [...provideUiI18nTesting(), provideRouter([]), provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
    fixture = TestBed.createComponent(GuidedDemoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('defines six stable steps with explicit completion criteria and live-call expectations', () => {
    expect(GUIDED_DEMO_STEPS.map(step => step.id)).toEqual([
      'introduction', 'document-upload', 'rag-question', 'form-generation', 'ai-observability', 'conclusion'
    ]);
    expect(GUIDED_DEMO_STEPS.every(step => step.completionCriteria.length > 0)).toBe(true);
    expect(GUIDED_DEMO_STEPS[2].liveAiCallMayBeRequired).toBe(true);
    expect(GUIDED_DEMO_STEPS[3].liveAiCallMayBeRequired).toBe(true);
    expect(component.ui.text(GUIDED_DEMO_STEPS[4].technicalExplanation)).toContain('locale');
  });

  it('shows accessible progress and focuses the updated heading after the next render', async () => {
    const progress = fixture.nativeElement.querySelector('[role="progressbar"]') as HTMLElement;
    expect(progress.getAttribute('aria-valuenow')).toBe('1');
    expect(component.stepStatuses()['introduction']).toBe('viewed');
    expect(component.stepStatuses()['document-upload']).toBe('not-visited');

    component.nextStep();
    expect(document.activeElement).not.toBe(fixture.nativeElement.querySelector('h2[tabindex="-1"]'));
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    fixture.detectChanges();

    expect(component.currentStepIndex()).toBe(1);
    const heading = fixture.nativeElement.querySelector('h2[tabindex="-1"]') as HTMLHeadingElement;
    expect(heading.textContent).toContain('Préparer un document');
    expect(document.activeElement).toBe(heading);
    expect(component.stepStatuses()['document-upload']).toBe('viewed');
    expect(component.stepStatuses()['document-upload']).not.toBe('user-confirmed');
    expect(component.stepStatuses()['document-upload']).not.toBe('technically-verified');
    expect(progress.getAttribute('aria-valuenow')).toBe('2');
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('h2[tabindex="-1"]'));
  });

  it('enforces Previous and Next boundaries', () => {
    expect(component.isFirstStep()).toBe(true);
    expect((fixture.nativeElement.querySelector('footer button') as HTMLButtonElement).disabled).toBe(true);
    component.previousStep();
    expect(component.currentStepIndex()).toBe(0);

    component.selectStep(GUIDED_DEMO_STEPS.length - 1);
    fixture.detectChanges();
    expect(component.isLastStep()).toBe(true);
    component.nextStep();
    expect(component.currentStepIndex()).toBe(GUIDED_DEMO_STEPS.length - 1);
    const footerButtons = Array.from(fixture.nativeElement.querySelectorAll('footer button')) as HTMLButtonElement[];
    expect(footerButtons.at(-1)?.disabled).toBe(true);
  });

  it('only records user confirmation and restart clears confirmations and visited steps', () => {
    component.confirmCurrentStep();
    expect(component.stepStatuses()['introduction']).toBe('user-confirmed');

    component.selectStep(3);
    component.confirmCurrentStep();
    expect(component.stepStatuses()['form-generation']).toBe('user-confirmed');

    component.restart();
    fixture.detectChanges();
    expect(component.currentStepIndex()).toBe(0);
    expect(component.stepStatuses()['introduction']).toBe('viewed');
    expect(component.stepStatuses()['form-generation']).toBe('not-visited');
    expect(Object.values(component.stepStatuses())).not.toContain('technically-verified');
  });

  it('retains every educational explanation, destination and completion criterion through the workflow', () => {
    for (let index = 0; index < component.steps.length; index++) {
      const button = fixture.nativeElement.querySelectorAll('nav button')[index] as HTMLButtonElement;
      button.click();fixture.detectChanges();
      const step = component.steps[index];
      const root = fixture.nativeElement as HTMLElement;
      expect(button.getAttribute('aria-current')).toBe('step');
      expect(root.querySelector('#business-explanation-title')?.parentElement?.textContent).toContain(component.ui.text(step.businessExplanation));
      expect(root.querySelector('#technical-explanation-title')?.parentElement?.textContent).toContain(component.ui.text(step.technicalExplanation));
      expect(root.querySelector('#user-instruction-title')?.parentElement?.textContent).toContain(component.ui.text(step.userInstruction));
      expect(root.querySelector('aside')?.textContent).toContain(component.ui.text(step.completionCriteria));
      const destination = root.querySelector('a[target="_blank"]');
      expect(destination?.getAttribute('href') ?? undefined).toBe(step.destinationRoute);
    }
    TestBed.inject(HttpTestingController).expectNone(() => true);
  });

  it('illustrates ingestion and RAG with their documented connections without executing requests', () => {
    component.selectStep(1);fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.demo-scene').getAttribute('data-step')).toBe('document-upload');
    expect(fixture.nativeElement.querySelectorAll('.demo-flow-edge')).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('.demo-flow-edge').getAttribute('data-edge-id')).toBe('ingestion-write');
    expect(fixture.nativeElement.querySelector('.demo-scene').textContent).toContain('API ingestion');
    component.selectStep(2);fixture.detectChanges();
    const edges = Array.from(fixture.nativeElement.querySelectorAll('.demo-flow-edge')) as HTMLElement[];
    expect(edges.map(edge => edge.getAttribute('data-edge-id')).sort()).toEqual(['rag-inference', 'rag-response', 'rag-retrieve']);
    expect(fixture.nativeElement.querySelector('.demo-scene').textContent).toContain('Aucun appel exécuté');
    expect(fixture.nativeElement.querySelector('details #technical-explanation-title')).not.toBeNull();
    TestBed.inject(HttpTestingController).expectNone(() => true);
  });

  it('uses accessible contrast classes for secondary text', () => {
    const template = fixture.nativeElement.innerHTML as string;
    expect(template).not.toContain('text-slate-400');
    expect(template).not.toContain('text-slate-500');
  });

  it('opens existing features in a separate tab and preserves this demo step on return', () => {
    component.selectStep(1);
    component.confirmCurrentStep();
    fixture.detectChanges();
    const featureLink = fixture.nativeElement.querySelector('a[target="_blank"]') as HTMLAnchorElement;

    expect(featureLink.getAttribute('href')).toBe('/generator');
    expect(featureLink.getAttribute('rel')).toContain('noopener');
    featureLink.addEventListener('click', event => event.preventDefault(), { once: true });
    featureLink.click();
    fixture.detectChanges();

    expect(component.currentStep().id).toBe('document-upload');
    expect(component.stepStatuses()['document-upload']).toBe('user-confirmed');

    component.selectStep(4);
    fixture.detectChanges();
    const dashboardLink = fixture.nativeElement.querySelector('a[target="_blank"]') as HTMLAnchorElement;
    expect(dashboardLink.getAttribute('href')).toBe('/dashboard');
    expect(component.currentStep().id).toBe('ai-observability');
  });

  it('labels roadmap items as planned and makes no automatic HTTP requests', () => {
    component.selectStep(5);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Prévision des coûts IA · disponible');
    expect(text).toContain('Intégration n8n');
    expect(text).toContain('planifiée, non implémentée');

    TestBed.inject(HttpTestingController).expectNone(() => true);
  });

  describe('control navigation and deferred focus lifecycle', () => {
    let frames: Map<number, FrameRequestCallback>;
    let nextFrameId: number;
    let requestFrame: jest.SpyInstance;
    let cancelFrame: jest.SpyInstance;

    const clickButton = (label: string): void => {
      const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
      const button = buttons.find(candidate => candidate.textContent?.trim() === label);
      expect(button).toBeDefined();
      button!.click();
      fixture.detectChanges();
    };

    const flushFrames = (): void => {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach(callback => callback(0));
    };

    beforeEach(() => {
      frames = new Map();
      nextFrameId = 0;
      requestFrame = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
        const id = ++nextFrameId;
        frames.set(id, callback);
        return id;
      });
      cancelFrame = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => {
        frames.delete(id);
      });
    });

    afterEach(() => {
      // Destroy while the scheduler spies are installed, including on assertion failure.
      fixture.destroy();
      jest.restoreAllMocks();
    });

    it.each([-1, GUIDED_DEMO_STEPS.length, 1.5, NaN, Infinity, -Infinity])(
      'ignores invalid step index %s without changing progress, statuses or scheduling focus', index => {
        clickButton('Suivant');
        flushFrames();
        const statuses = { ...component.stepStatuses() };
        requestFrame.mockClear();
        cancelFrame.mockClear();

        component.selectStep(index);
        fixture.detectChanges();

        expect(component.currentStepIndex()).toBe(1);
        expect(component.stepStatuses()).toEqual(statuses);
        expect(fixture.nativeElement.querySelector('[role="progressbar"]').getAttribute('aria-valuenow')).toBe('2');
        expect(requestFrame).not.toHaveBeenCalled();
        expect(cancelFrame).not.toHaveBeenCalled();
      }
    );

    it('cancels stale focus callbacks during rapid rendered step selections and focuses only after rendering', () => {
      const buttons = fixture.nativeElement.querySelectorAll('nav button') as NodeListOf<HTMLButtonElement>;
      const heading = fixture.nativeElement.querySelector('h2[tabindex="-1"]') as HTMLHeadingElement;
      const focus = jest.spyOn(heading, 'focus');
      buttons[1].click();
      const firstId = nextFrameId;
      buttons[3].click();
      const secondId = nextFrameId;
      buttons[4].click();
      fixture.detectChanges();

      expect(cancelFrame.mock.calls).toEqual([[firstId], [secondId]]);
      expect(frames.size).toBe(1);
      expect(focus).not.toHaveBeenCalled();
      expect(heading.textContent).toContain(component.ui.text(GUIDED_DEMO_STEPS[4].title));
      flushFrames();
      expect(focus).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe(heading);
      expect(buttons[4].getAttribute('aria-current')).toBe('step');
      expect(fixture.nativeElement.querySelectorAll('nav button[aria-current="step"]')).toHaveLength(1);
    });

    it('cancels pending focus on destruction without focusing the removed heading', () => {
      const heading = fixture.nativeElement.querySelector('h2[tabindex="-1"]') as HTMLHeadingElement;
      const focus = jest.spyOn(heading, 'focus');
      clickButton('Suivant');
      const pendingId = nextFrameId;
      expect(frames.size).toBe(1);

      fixture.destroy();
      expect(cancelFrame).toHaveBeenCalledWith(pendingId);
      expect(frames.size).toBe(0);
      flushFrames();
      expect(focus).not.toHaveBeenCalled();
    });

    it('completes and restarts a tour through rendered controls without HTTP requests', () => {
      const http = TestBed.inject(HttpTestingController);
      const progress = fixture.nativeElement.querySelector('[role="progressbar"]') as HTMLElement;
      clickButton('Précédent');
      expect(component.currentStepIndex()).toBe(0);
      expect(requestFrame).not.toHaveBeenCalled();
      for (let index = 0; index < GUIDED_DEMO_STEPS.length; index++) {
        expect(component.currentStep().id).toBe(GUIDED_DEMO_STEPS[index].id);
        expect(progress.getAttribute('aria-valuenow')).toBe(String(index + 1));
        clickButton('Je confirme cette étape');
        expect(component.stepStatuses()[GUIDED_DEMO_STEPS[index].id]).toBe('user-confirmed');
        http.expectNone(() => true);
        if (index < GUIDED_DEMO_STEPS.length - 1) {
          clickButton('Suivant');
          flushFrames();
        }
      }
      clickButton('Suivant');
      expect(component.currentStepIndex()).toBe(GUIDED_DEMO_STEPS.length - 1);
      clickButton('Précédent');
      flushFrames();
      expect(component.currentStepIndex()).toBe(GUIDED_DEMO_STEPS.length - 2);
      expect(component.stepStatuses()['ai-observability']).toBe('user-confirmed');
      clickButton('Recommencer');
      flushFrames();

      expect(progress.getAttribute('aria-valuenow')).toBe('1');
      expect(progress.getAttribute('aria-valuemax')).toBe(String(GUIDED_DEMO_STEPS.length));
      expect(progress.getAttribute('aria-valuetext')).toContain('Consultée');
      expect(parseFloat((progress.firstElementChild as HTMLElement).style.width)).toBeCloseTo(100 / GUIDED_DEMO_STEPS.length);
      expect(component.stepStatuses()).toEqual(Object.fromEntries(
        GUIDED_DEMO_STEPS.map((step, index) => [step.id, index === 0 ? 'viewed' : 'not-visited'])
      ));
      expect(fixture.nativeElement.querySelector('nav button[aria-current="step"]').getAttribute('aria-label'))
        .toContain(component.ui.text(GUIDED_DEMO_STEPS[0].title));
      expect(document.activeElement).toBe(fixture.nativeElement.querySelector('h2[tabindex="-1"]'));
      http.expectNone(() => true);
    });
  });

});
