import { ShowcaseFeaturesComponent } from './showcase-features.component';
import { By } from '@angular/platform-browser';
import { PUBLIC_PRESENTATION } from '../presentation-mode';
import { GuidedDemoComponent } from '../components/guided-demo/guided-demo.component';
import { ArchitectureExplorerComponent } from '../components/architecture-explorer/architecture-explorer.component';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideUiI18nTesting } from '../i18n/ui-i18n.testing';
import { UiLanguageService } from '../i18n/ui-language.service';
import { ShowcaseComponent } from './showcase.component';
import { showcaseRoutes } from './showcase.config';

describe('Public showcase', () => {
  async function create() {
    TestBed.configureTestingModule({imports:[ShowcaseComponent],providers:[{provide:PUBLIC_PRESENTATION,useValue:true},...provideUiI18nTesting(),provideRouter(showcaseRoutes),provideHttpClient(),provideHttpClientTesting()]});
    const fixture=TestBed.createComponent(ShowcaseComponent);
    const language=TestBed.inject(UiLanguageService); await language.ready;
    await TestBed.inject(Router).navigateByUrl('/');fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
    return {fixture,language};
  }
  it('provides only the home page, redirects excluded routes and makes no API requests', async () => {
    const {fixture}=await create(); const router=TestBed.inject(Router);
    expect(showcaseRoutes.map(r=>r.path)).toEqual(['','features','guided-demo','architecture','**']);
    for(const path of ['/generator','/dashboard','/agent-workspace?space=workflows']){
      await router.navigateByUrl(path);fixture.detectChanges();expect(router.url).toBe('/');
    }
    expect(fixture.nativeElement.querySelector('h1').textContent).toContain('Vos opérations IA');
    expect(fixture.nativeElement.querySelectorAll('.capability-grid article')).toHaveLength(3);
    expect(fixture.nativeElement.querySelectorAll('form,input')).toHaveLength(0);
    const links=Array.from(fixture.nativeElement.querySelectorAll('a')) as HTMLAnchorElement[];
    expect(links.every(a=>['/','/features','/guided-demo','/architecture'].includes((a.getAttribute('href')??'').split('#')[0])||a.getAttribute('href')?.startsWith('#'))).toBe(true);
    TestBed.inject(HttpTestingController).expectNone(()=>true);
  });
  it('preserves accessible mobile navigation and supports both languages without business calls', async () => {
    const {fixture,language}=await create();
    const toggle=fixture.nativeElement.querySelector('.menu') as HTMLButtonElement;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();fixture.detectChanges();expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const nav=fixture.nativeElement.querySelector('nav') as HTMLElement;
    expect(nav.id).toBe(toggle.getAttribute('aria-controls'));
    nav.querySelector('a')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');expect(document.activeElement).toBe(toggle);
    await language.use('en');fixture.detectChanges();expect(fixture.nativeElement.querySelector('h1').textContent).toContain('Clearer AI operations');
    expect(fixture.nativeElement.textContent).not.toMatch(/showcase\./);
    expect(fixture.nativeElement.querySelectorAll('.languages [aria-pressed=true]')).toHaveLength(1);
    expect(localStorage.getItem('enterprise-ai-dashboard.ui-language')).toBe('en');
    await language.use('fr');fixture.detectChanges();expect(fixture.nativeElement.querySelector('h1').textContent).toContain('Vos opérations IA');
    TestBed.inject(HttpTestingController).expectNone(()=>true);
  });
  it('retains both interactive informational modules with only safe links in FR and EN', async () => {
    const {fixture,language}=await create(); const router=TestBed.inject(Router);
    const safeLinks=()=>{
      for(const a of Array.from(fixture.nativeElement.querySelectorAll('a')) as HTMLAnchorElement[]){
        const path=new URL(a.getAttribute('href')!, 'https://showcase.invalid').pathname;
        expect(['/','/features','/guided-demo','/architecture']).toContain(path);
      }
      TestBed.inject(HttpTestingController).expectNone(()=>true);
    };
    for(const lang of ['fr','en'] as const){
      await language.use(lang);
      await router.navigateByUrl('/guided-demo');fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
      const demo=fixture.debugElement.query(By.directive(GuidedDemoComponent)).componentInstance as GuidedDemoComponent;
      expect(demo.publicPresentation).toBe(true);expect(demo.steps).toHaveLength(6);
      for(let i=0;i<6;i++){
        demo.selectStep(i);fixture.detectChanges();expect(demo.currentStepIndex()).toBe(i);
        demo.confirmCurrentStep();fixture.detectChanges();expect(demo.stepStatuses()[demo.currentStep().id]).toBe('user-confirmed');safeLinks();
      }
      demo.previousStep();expect(demo.currentStepIndex()).toBe(4);demo.nextStep();expect(demo.currentStepIndex()).toBe(5);
      demo.selectTour(false);fixture.detectChanges();safeLinks();
      await router.navigateByUrl('/architecture');fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
      const architecture=fixture.debugElement.query(By.directive(ArchitectureExplorerComponent)).componentInstance as ArchitectureExplorerComponent;
      expect(architecture.publicPresentation).toBe(true);
      for(const flow of architecture.flows){
        architecture.selectedFlowId.set(flow.id);
        for(const node of architecture.nodes){architecture.selectNode(node);fixture.detectChanges();safeLinks();}
      }
      await router.navigateByUrl('/');fixture.detectChanges();expect(fixture.nativeElement.querySelector('.hero')).not.toBeNull();safeLinks();
    }
  });

  it('renders seven real static captures and provides keyboard-closeable enlargement in both languages', async () => {
    const {fixture,language}=await create();const router=TestBed.inject(Router);
    await router.navigateByUrl('/features');fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
    const gallery=fixture.debugElement.query(By.directive(ShowcaseFeaturesComponent)).componentInstance as ShowcaseFeaturesComponent;
    const dialog=fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    // jsdom has no native modal implementation. Browser focus trapping is provided by showModal().
    dialog.showModal=jest.fn(()=>dialog.setAttribute('open',''));
    dialog.close=jest.fn(()=>{dialog.removeAttribute('open');dialog.dispatchEvent(new Event('close'));});
    for(const lang of ['fr','en'] as const){
      await language.use(lang);fixture.detectChanges();
      const buttons=Array.from(fixture.nativeElement.querySelectorAll('.capture-card>button')) as HTMLButtonElement[];
      expect(buttons).toHaveLength(7);
      const images=Array.from(fixture.nativeElement.querySelectorAll('.capture-card img')) as HTMLImageElement[];
      expect(images.every(img=>img.getAttribute('src')?.startsWith('assets/showcase/screenshots/')&&!!img.alt)).toBe(true);
      buttons[0].focus();buttons[0].click();fixture.detectChanges();
      expect(dialog.showModal).toHaveBeenCalled();expect(gallery.selected()?.id).toBe('overview');
      expect(dialog.getAttribute('aria-labelledby')).toBe(dialog.querySelector('h2')!.id);
      expect(document.activeElement).toBe(dialog.querySelector('button'));
      dialog.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));fixture.detectChanges();
      expect(gallery.selected()).toBeNull();expect(document.activeElement).toBe(buttons[0]);
      buttons[1].click();fixture.detectChanges();dialog.querySelector('button')!.click();fixture.detectChanges();expect(gallery.selected()).toBeNull();
      expect(fixture.nativeElement.querySelectorAll('form,input')).toHaveLength(0);
      TestBed.inject(HttpTestingController).expectNone(()=>true);
    }
  });

});
