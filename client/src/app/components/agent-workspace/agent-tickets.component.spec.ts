import { By } from '@angular/platform-browser';
import { AgentEscalationsComponent } from './agent-escalations.component';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, Subject, throwError } from 'rxjs';
import { provideUiI18nTesting } from '../../i18n/ui-i18n.testing';
import { UiLanguageService } from '../../i18n/ui-language.service';
import { AgentTicketsComponent } from './agent-tickets.component';
import { SupportTicketService } from '../../services/support-ticket.service';
import { AgentService } from '../../services/agent.service';
import { SupportTicket, TicketEvent, TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES } from '../../models/support-ticket.model';
import { emptySupportAgent } from '../../models/support-agent.model';

const agent = { ...emptySupportAgent(), id:'a',name:'NovaShop',version:1,createdAt:'',updatedAt:'' };
const conversation = {id:'c',agent_id:'a',title:'Commande NS-2026-1042',status:'open' as const,created_at:'',updated_at:''};
const record = (overrides:Partial<SupportTicket>={}):SupportTicket=>({id:'t',agentId:'a',conversationId:'c',sourceMessageId:'m',title:'Casque défectueux',description:'Scénario fictif NS-2026-1042',category:'defective_product',priority:'medium',status:'open',classificationSource:'rules',classificationReason:'defective_product:keywords;medium:default',classificationConfidence:null,version:1,createdAt:'2026-11-04T10:00:00Z',updatedAt:'2026-11-04T10:00:00Z',closedAt:null,...overrides});
const event:TicketEvent={id:1,type:'status_changed',oldValue:'open',newValue:'in_progress',origin:'local_user',createdAt:'2026-11-04T10:00:00Z'};
const counts={open:1,in_progress:0,waiting:0,resolved:0,closed:0};
describe('AgentTicketsComponent',()=>{
  let fixture:ComponentFixture<AgentTicketsComponent>,c:AgentTicketsComponent;
  let api:Record<'list'|'get'|'create'|'update'|'events'|'escalations',jest.Mock>,agents:{listConversations:jest.Mock;getConversation:jest.Mock;askAgent:jest.Mock};
  const text=()=>fixture.nativeElement.textContent as string;
  const button=(label:string)=>(Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[]).find(b=>b.textContent?.trim()===label)!;
  beforeEach(async()=>{
    Object.defineProperty(crypto,'randomUUID',{configurable:true,value:jest.fn().mockReturnValue('00000000-0000-4000-8000-000000000001')});
    api={escalations:jest.fn().mockReturnValue(of({active:null,items:[],total:0,limit:25,offset:0})),list:jest.fn().mockReturnValue(of({items:[record()],total:1,offset:0,limit:25,counts})),get:jest.fn().mockReturnValue(of(record())),create:jest.fn().mockReturnValue(of(record())),update:jest.fn().mockReturnValue(of(record({status:'in_progress',version:2}))),events:jest.fn().mockReturnValue(of({items:[event],total:1,offset:0,limit:25}))};
    agents={listConversations:jest.fn().mockReturnValue(of({items:[conversation],total:1})),getConversation:jest.fn().mockReturnValue(of({conversation,items:[]})),askAgent:jest.fn()};
    await TestBed.configureTestingModule({imports:[AgentTicketsComponent],providers:[...provideUiI18nTesting(),{provide:SupportTicketService,useValue:api},{provide:AgentService,useValue:agents}]}).compileComponents();
    fixture=TestBed.createComponent(AgentTicketsComponent);c=fixture.componentInstance;fixture.componentRef.setInput('agent',agent);fixture.detectChanges();
  });
  afterEach(()=>expect(agents.askAgent).not.toHaveBeenCalled());
  async function fill(){button('Créer un ticket').click();fixture.detectChanges();await fixture.whenStable();const title=fixture.nativeElement.querySelector('#ticket-title') as HTMLInputElement;title.value='NovaShop — NS-2026-1042';title.dispatchEvent(new Event('input'));const desc=fixture.nativeElement.querySelector('#ticket-description') as HTMLTextAreaElement;desc.value='Sophie Martin (fictive) : casque Bluetooth défectueux.';desc.dispatchEvent(new Event('input'));fixture.detectChanges();}
  it('loads a real list and agent-wide counts, renders empty, loading and recoverable errors',()=>{
    expect(text()).toContain('Casque défectueux');expect(text()).toContain('Produit défectueux');expect(c.counts()).toEqual(counts);expect(agents.listConversations).not.toHaveBeenCalled();
    const pending=new Subject<any>();api.list.mockReturnValue(pending);c.load();fixture.detectChanges();expect(text()).toContain('Chargement');pending.next({items:[],total:0,offset:0,counts});fixture.detectChanges();expect(text()).toContain('Aucun ticket');
    api.list.mockReturnValue(throwError(()=>new Error('offline')));c.load();fixture.detectChanges();expect(text()).toContain('Tickets indisponibles');expect(api.create).not.toHaveBeenCalled();
  });
  it('validates rendered inputs and requires a second explicit confirmation before creation',async()=>{
    button('Créer un ticket').click();fixture.detectChanges();fixture.nativeElement.querySelector('.editor form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));fixture.detectChanges();expect(c.confirming()).toBe(false);expect(text()).toContain('Titre et description obligatoires');expect(api.create).not.toHaveBeenCalled();
    await fill();button('Vérifier avant création').click();fixture.detectChanges();expect(c.confirming()).toBe(true);expect(api.create).not.toHaveBeenCalled();button('Confirmer la création').click();fixture.detectChanges();
    expect(api.create).toHaveBeenCalledTimes(1);expect(api.create.mock.calls[0][1]).toEqual(expect.objectContaining({title:'NovaShop — NS-2026-1042',description:'Sophie Martin (fictive) : casque Bluetooth défectueux.',conversationId:null,sourceMessageId:null,requestId:expect.any(String)}));expect(api.create.mock.calls[0][1].category).toBeUndefined();expect(text()).toContain('Ticket enregistré');expect(c.dirty()).toBe(false);
  });
  it('preserves the request ID across uncertain retries and blocks double-click creation while pending',async()=>{
    await fill();c.review();const pending=new Subject<SupportTicket>();api.create.mockReturnValueOnce(pending);c.create();c.create();expect(api.create).toHaveBeenCalledTimes(1);
    pending.error(new HttpErrorResponse({status:0}));fixture.detectChanges();expect(c.form.controls.title.value).toContain('NS-2026-1042');const original=api.create.mock.calls[0][1];c.create();expect(api.create).toHaveBeenCalledTimes(2);expect(api.create.mock.calls[1][1]).toEqual(original);
  });
  it('creates a controlled manual classification and preserves codes independently of UI language',async()=>{
    await fill();c.form.controls.rules.setValue(false);c.form.controls.category.setValue('defective_product');c.form.controls.priority.setValue('high');c.review();c.create();expect(api.create.mock.calls[0][1]).toEqual(expect.objectContaining({category:'defective_product',priority:'high'}));
  });
  it('prefills from a conversation and source message without editing it or creating automatically',()=>{
    const original={conversation,description:'Casque Bluetooth défectueux, commande NS-2026-1042',sourceMessageId:'m'};fixture.componentRef.setInput('conversationDraft',original);fixture.detectChanges();
    expect(c.form.controls.title.value).toBe(conversation.title);expect(c.form.controls.conversationId.value).toBe('c');expect(c.sourceMessageId()).toBe('m');expect(c.form.dirty).toBe(true);expect(api.create).not.toHaveBeenCalled();expect(original.description).toContain('défectueux');c.review();c.create();expect(api.create.mock.calls[0][1].sourceMessageId).toBe('m');
  });
  it('applies real filters and bounded pages, ignoring an older list response',()=>{
    const old=new Subject<any>();api.list.mockReturnValueOnce(old);c.load();c.filters.search='NS-2026-1042';c.filters.status='open';c.filters.category='defective_product';c.filters.priority='high';c.applyFilters();expect(api.list).toHaveBeenLastCalledWith('a',expect.objectContaining({search:'NS-2026-1042',category:'defective_product',priority:'high',status:'open'}),0);
    old.next({items:[],total:0,offset:0,counts});expect(c.items()).toHaveLength(1);c.total.set(30);c.page(1);expect(api.list.mock.calls.at(-1)[2]).toBe(25);c.offset.set(0);const calls=api.list.mock.calls.length;c.page(-1);expect(api.list).toHaveBeenCalledTimes(calls);
  });
  it('loads detail and chronological audit, saves status with version and retains drafts after conflict',()=>{
    fixture.nativeElement.querySelector('.ticket-row').click();fixture.detectChanges();expect(c.selected()?.id).toBe('t');expect(text()).toContain('Changement de statut');expect(text()).toContain('Utilisateur local');
    const select=fixture.nativeElement.querySelector('select[formControlName="status"]') as HTMLSelectElement;select.value='in_progress';select.dispatchEvent(new Event('change'));fixture.detectChanges();button('Enregistrer les modifications').click();fixture.detectChanges();expect(api.update).toHaveBeenCalledWith('a','t',{version:1,status:'in_progress',priority:'medium',category:'defective_product'});expect(c.selected()?.version).toBe(2);expect(text()).toContain('historisées');
    c.edit.controls.priority.setValue('urgent');c.edit.markAsDirty();api.update.mockReturnValue(throwError(()=>new HttpErrorResponse({status:409})));c.save();fixture.detectChanges();expect(c.edit.controls.priority.value).toBe('urgent');expect(c.dirty()).toBe(true);expect(text()).toContain('Conflit');c.cancel();expect(c.dirty()).toBe(false);
  });
  it('retrieves only the owned origin conversation and reports deletion without emitting navigation',()=>{
    c.open(record());const open=jest.fn();c.openConversation.subscribe(open);c.goToConversation();expect(agents.getConversation).toHaveBeenCalledWith('a','c');expect(open).toHaveBeenCalledWith(conversation);
    agents.getConversation.mockReturnValue(throwError(()=>new HttpErrorResponse({status:404})));c.goToConversation();expect(open).toHaveBeenCalledTimes(1);expect(c.error()).toBe('tickets.notFound');
  });
  it('keeps input DOM, draft, confirmation and filters during FR/EN switching without HTTP mutations',async()=>{
    await fill();c.filters.category='defective_product';c.filters.search='NS-2026-1042';c.review();fixture.detectChanges();const input=fixture.nativeElement.querySelector('#ticket-title');const form=c.form;const calls=api.list.mock.calls.length;
    await TestBed.inject(UiLanguageService).use('en');fixture.detectChanges();expect(text()).toContain('Confirm creation');expect(text()).toContain('Defective product');expect(fixture.nativeElement.querySelector('#ticket-title')).toBe(input);expect(c.form).toBe(form);expect(c.form.controls.title.value).toContain('NS-2026-1042');expect(c.confirming()).toBe(true);expect(c.filters.search).toBe('NS-2026-1042');expect(c.filters.category).toBe('defective_product');expect(api.list).toHaveBeenCalledTimes(calls);expect(api.create).not.toHaveBeenCalled();
    for(const code of TICKET_CATEGORIES)expect(c.label('category',code)).not.toMatch(/^tickets\./);for(const code of TICKET_PRIORITIES)expect(c.label('priority',code)).not.toMatch(/^tickets\./);for(const code of TICKET_STATUSES)expect(c.label('status',code)).not.toMatch(/^tickets\./);
    await TestBed.inject(UiLanguageService).use('fr');fixture.detectChanges();expect(text()).toContain('Confirmer la création');expect(c.form.dirty).toBe(true);
  });
  it('preserves draft protection, cancellation and subscriptions when changing agent or destroying',async()=>{
    await fill();const notify=jest.fn();c.dirtyChange.subscribe(notify);c.newTicket();expect(c.error()).toBe('tickets.unsaved');c.cancel();expect(c.dirty()).toBe(false);expect(notify).toHaveBeenLastCalledWith(false);
    const pending=new Subject<any>();api.list.mockReturnValue(pending);c.load();expect(pending.observed).toBe(true);fixture.destroy();expect(pending.observed).toBe(false);
  });
  it('does not mix event pages from a previously selected ticket and permits history retry',()=>{
    api.get.mockImplementation((_agent: string,id: string)=>of(record({id})));const pending=new Subject<any>();api.events.mockReturnValueOnce(pending);c.open(record());c.open(record({id:'second'}));pending.next({items:[{...event,id:99}],total:1});expect(c.events().some(e=>e.id===99)).toBe(false);
    api.events.mockReturnValue(throwError(()=>new Error('offline')));c.loadEvents();expect(c.eventError()).toBe(true);api.events.mockReturnValue(of({items:[event],total:2}));c.loadEvents();c.loadEvents(true);expect(api.events).toHaveBeenLastCalledWith('a','second',1);expect(c.eventError()).toBe(false);
  });
  it('renders ticket descriptions as plain text rather than executable markup',()=>{
    api.get.mockReturnValue(of(record({description:'<img src=x onerror=alert(1)>'})));c.open(record());fixture.detectChanges();expect(fixture.nativeElement.querySelector('img')).toBeNull();expect(text()).toContain('<img src=x onerror=alert(1)>');
  });

  it('protects escalation drafts from ticket selection and new ticket navigation',()=>{
    c.open(record());fixture.detectChanges();const panel=fixture.debugElement.query(By.directive(AgentEscalationsComponent)).componentInstance as AgentEscalationsComponent;
    panel.start();fixture.detectChanges();expect(c.handoffDirty()).toBe(true);expect(c.dirty()).toBe(true);c.newTicket();expect(c.selected()?.id).toBe('t');c.open(record({id:'other'}));expect(c.selected()?.id).toBe('t');panel.cancelDraft();expect(c.handoffDirty()).toBe(false);
  });

});
