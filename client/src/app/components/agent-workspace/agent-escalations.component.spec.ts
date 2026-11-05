import {TestBed,ComponentFixture} from '@angular/core/testing';
import {of,Subject,throwError} from 'rxjs';
import {HttpErrorResponse} from '@angular/common/http';
import {AgentEscalationsComponent} from './agent-escalations.component';
import {SupportTicketService} from '../../services/support-ticket.service';
import {provideUiI18nTesting} from '../../i18n/ui-i18n.testing';
import {UiLanguageService} from '../../i18n/ui-language.service';
import {SupportEscalation} from '../../models/support-escalation.model';
const record=(overrides:Partial<SupportEscalation>={}):SupportEscalation=>({id:'e',ticketId:'t',reason:'refund_validation',details:'NS-2026-1042 fictif',status:'requested',operator:null,note:'',version:1,createdAt:'2026-11-04T10:00:00Z',assignedAt:null,resolvedAt:null,cancelledAt:null,...overrides});
describe('Human escalation panel',()=>{
 let fixture:ComponentFixture<AgentEscalationsComponent>,c:AgentEscalationsComponent,api:Record<string,jest.Mock>;
 const button=(label:string)=>(Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[]).find(b=>b.textContent?.trim()===label)!;
 const text=()=>fixture.nativeElement.textContent as string;
 beforeEach(async()=>{
  Object.defineProperty(crypto,'randomUUID',{configurable:true,value:jest.fn().mockReturnValue('00000000-0000-4000-8000-000000000001')});
  api={escalations:jest.fn().mockReturnValue(of({active:null,items:[],total:0,limit:25,offset:0})),requestEscalation:jest.fn().mockReturnValue(of(record())),updateEscalation:jest.fn().mockReturnValue(of(record({status:'assigned',version:2,operator:'Fictif'}))),escalationEvents:jest.fn().mockReturnValue(of({items:[],total:0})),askAgent:jest.fn()};
  await TestBed.configureTestingModule({imports:[AgentEscalationsComponent],providers:[...provideUiI18nTesting(),{provide:SupportTicketService,useValue:api}]}).compileComponents();
  fixture=TestBed.createComponent(AgentEscalationsComponent);c=fixture.componentInstance;fixture.componentRef.setInput('agentId','a');fixture.componentRef.setInput('ticketId','t');fixture.detectChanges();
 });
 afterEach(()=>expect(api.askAgent).not.toHaveBeenCalled());
 it('renders empty state and requires review and explicit confirmation before creating',()=>{
  expect(text()).toContain('Aucun transfert actif');button('Demander un transfert').click();fixture.detectChanges();c.request.controls.details.setValue('Scénario NS-2026-1042');button('Vérifier la demande').click();fixture.detectChanges();expect(api.requestEscalation).not.toHaveBeenCalled();expect(c.dirty()).toBe(true);button('Confirmer la décision').click();fixture.detectChanges();expect(api.requestEscalation).toHaveBeenCalledWith('a','t',expect.objectContaining({reason:'refund_validation',details:'Scénario NS-2026-1042',requestId:expect.any(String)}));expect(c.dirty()).toBe(false);
 });
 it('requires details for Other and preserves draft/key after errors, preventing double submission',()=>{
  c.start();c.request.setValue({reason:'other',details:''});c.review('request');expect(c.confirmation()).toBeNull();c.request.controls.details.setValue('Détails fictifs');c.review('request');const pending=new Subject<SupportEscalation>();api.requestEscalation.mockReturnValueOnce(pending);c.submit();c.submit();expect(api.requestEscalation).toHaveBeenCalledTimes(1);const body=api.requestEscalation.mock.calls[0][2];pending.error(new HttpErrorResponse({status:0}));expect(c.confirmation()).toBe('request');expect(c.request.controls.details.value).toBe('Détails fictifs');c.submit();expect(api.requestEscalation.mock.calls[1][2]).toEqual(body);
 });
 it('assigns, notes, resolves and cancels with explicit confirmation and version without changing ticket status',()=>{
  c.inspect(record());c.review('resolve');expect(c.confirmation()).toBeNull();c.treatment.controls.operator.setValue('Opérateur fictif');c.review('assign');expect(api.updateEscalation).not.toHaveBeenCalled();c.submit();expect(api.updateEscalation).toHaveBeenLastCalledWith('a','t','e',expect.objectContaining({action:'assign',version:1,operator:'Opérateur fictif'}));
  for(const action of ['note','resolve','cancel'] as const){c.inspect(record({status:'assigned',version:2,operator:'Fictif'}));c.treatment.controls.note.setValue('Examiné — aucun remboursement');c.review(action);c.submit();expect(api.updateEscalation).toHaveBeenLastCalledWith('a','t','e',expect.objectContaining({action,version:2,note:'Examiné — aucun remboursement'}));}
 });
 it('renders all states and paginated history as plain text',()=>{
  for(const [status,label] of [['requested','Demandé'],['assigned','Affecté'],['resolved','Résolu'],['cancelled','Annulé']] as const){c.inspect(record({status,note:'<img src=x>'}));fixture.detectChanges();expect(text()).toContain(label);expect(fixture.nativeElement.querySelector('img')).toBeNull();}
  api.escalationEvents.mockReturnValue(of({items:[{id:1,type:'resolved',oldStatus:'assigned',newStatus:'resolved',operator:'Fictif',note:'Examiné',createdAt:'2026-11-04T10:00:00Z'}],total:2}));c.loadEvents();fixture.detectChanges();expect(text()).toContain('Transfert résolu');expect(text()).toContain('Examiné');c.loadEvents(true);expect(api.escalationEvents).toHaveBeenLastCalledWith('a','t','e',1);
 });
 it('handles loading, active duplicate prevention, conflicts and explicit draft discard',()=>{
  const pending=new Subject<any>();api.escalations.mockReturnValueOnce(pending);c.load();fixture.detectChanges();expect(text()).toContain('Chargement');pending.next({active:record(),items:[record()],total:1});c.start();expect(c.creating()).toBe(false);c.inspect(record());c.treatment.controls.operator.setValue('À préserver');c.treatment.markAsDirty();c.review('assign');api.updateEscalation.mockReturnValue(throwError(()=>new HttpErrorResponse({status:409})));c.submit();fixture.detectChanges();expect(c.treatment.controls.operator.value).toBe('À préserver');expect(text()).toContain('Conflit');c.cancelDraft();expect(c.treatment.controls.operator.value).toBe('À préserver');c.cancelDraft();expect(c.dirty()).toBe(false);
 });
 it('keeps FR/EN input DOM and notes without any mutation or inference on language switch',async()=>{
  c.start();c.request.controls.details.setValue('User original content');c.review('request');fixture.detectChanges();const input=fixture.nativeElement.querySelector('textarea');const calls=api.escalations.mock.calls.length;await TestBed.inject(UiLanguageService).use('en');fixture.detectChanges();expect(text()).toContain('Confirm decision');expect(text()).toContain('Refund requiring approval');expect(c.request.controls.details.value).toBe('User original content');expect(fixture.nativeElement.querySelector('textarea')).toBe(input);expect(api.escalations).toHaveBeenCalledTimes(calls);expect(api.requestEscalation).not.toHaveBeenCalled();
 });
 it('ignores old event responses, cancels subscriptions and protects unload',()=>{
  const pending=new Subject<any>();api.escalationEvents.mockReturnValueOnce(pending);c.inspect(record());c.inspect(record({id:'second'}));pending.next({items:[{id:99}],total:1});expect(c.events()).toEqual([]);c.start();const event=new Event('beforeunload',{cancelable:true});c.beforeUnload(event as BeforeUnloadEvent);expect(event.defaultPrevented).toBe(true);const list=new Subject<any>();api.escalations.mockReturnValue(list);c.load();fixture.destroy();expect(list.observed).toBe(false);
 });
 it('reports list and history errors with safe retry controls',()=>{
  api.escalations.mockReturnValue(throwError(()=>new Error('private')));c.load();fixture.detectChanges();expect(text()).toContain('Transferts indisponibles');expect(text()).not.toContain('private');api.escalationEvents.mockReturnValue(throwError(()=>new Error('private')));c.inspect(record());expect(c.eventError()).toBe(true);
 });
 it('automatically opens the assigned active handoff when mounting and after component reload, using reads only',()=>{
  const active=record({status:'assigned',operator:'Fictif',version:2});
  api.escalations.mockReturnValue(of({active,items:[active],total:1}));
  api.escalationEvents.mockReturnValue(of({items:[{id:1,type:'assigned',oldStatus:'requested',newStatus:'assigned',operator:'Fictif',note:'',createdAt:active.createdAt}],total:1}));
  fixture.destroy();
  for(let i=0;i<2;i++){
   fixture=TestBed.createComponent(AgentEscalationsComponent);c=fixture.componentInstance;fixture.componentRef.setInput('agentId','a');fixture.componentRef.setInput('ticketId','t');fixture.detectChanges();
   expect(c.selected()?.id).toBe(active.id);expect(c.selected()?.status).toBe('assigned');expect(button('Résoudre le transfert')).toBeDefined();expect(button('Annuler le transfert')).toBeDefined();expect(button('Ajouter une note')).toBeDefined();
   expect(fixture.nativeElement.querySelector('textarea[formControlName="note"]')).not.toBeNull();expect(text()).toContain('Historique du transfert');expect(text()).toContain('Transfert affecté');
   expect(api.escalationEvents).toHaveBeenCalledWith('a','t','e',0);if(i===0)fixture.destroy();
  }
  expect(api.requestEscalation).not.toHaveBeenCalled();expect(api.updateEscalation).not.toHaveBeenCalled();
 });
 it('keeps the selected handoff after assigning and adding a note through rendered controls',()=>{
  const initial=record(),assigned=record({status:'assigned',operator:'Opérateur fictif',version:2});
  api.escalations.mockReturnValue(of({active:initial,items:[initial],total:1}));c.load();fixture.detectChanges();
  const operator=fixture.nativeElement.querySelector('input[formControlName="operator"]') as HTMLInputElement;operator.value='Opérateur fictif';operator.dispatchEvent(new Event('input'));fixture.detectChanges();
  api.updateEscalation.mockReturnValueOnce(of(assigned));api.escalations.mockReturnValue(of({active:assigned,items:[assigned],total:1}));button('Affecter').click();fixture.detectChanges();expect(api.updateEscalation).not.toHaveBeenCalled();button('Confirmer la décision').click();fixture.detectChanges();
  expect(c.selected()).toEqual(assigned);expect(button('Résoudre le transfert')).toBeDefined();
  const note=fixture.nativeElement.querySelector('textarea[formControlName="note"]') as HTMLTextAreaElement;note.value='Note originale';note.dispatchEvent(new Event('input'));fixture.detectChanges();
  const updated={...assigned,note:'Note originale',version:3};api.updateEscalation.mockReturnValueOnce(of(updated));api.escalations.mockReturnValue(of({active:updated,items:[updated],total:1}));button('Ajouter une note').click();fixture.detectChanges();expect(api.updateEscalation).toHaveBeenCalledTimes(1);button('Confirmer la décision').click();fixture.detectChanges();
  expect(c.selected()).toEqual(updated);expect(text()).toContain('Note originale');expect(text()).toContain('Décision enregistrée');expect(api.updateEscalation).toHaveBeenCalledTimes(2);
 });
 it('keeps a resolved handoff selected with its history and hides further mutation controls',()=>{
  const active=record({status:'assigned',operator:'Fictif',version:2});api.escalations.mockReturnValue(of({active,items:[active],total:1}));c.load();fixture.detectChanges();
  const note=fixture.nativeElement.querySelector('textarea[formControlName="note"]') as HTMLTextAreaElement;note.value='Examiné sans remboursement';note.dispatchEvent(new Event('input'));fixture.detectChanges();
  const resolved={...active,status:'resolved' as const,note:'Examiné sans remboursement',version:3,resolvedAt:active.createdAt};api.updateEscalation.mockReturnValueOnce(of(resolved));api.escalations.mockReturnValue(of({active:null,items:[resolved],total:1}));api.escalationEvents.mockReturnValue(of({items:[{id:2,type:'resolved',oldStatus:'assigned',newStatus:'resolved',operator:'Fictif',note:resolved.note,createdAt:active.createdAt}],total:1}));
  button('Résoudre le transfert').click();fixture.detectChanges();expect(api.updateEscalation).not.toHaveBeenCalled();button('Confirmer la décision').click();fixture.detectChanges();
  expect(c.selected()).toEqual(resolved);expect(text()).toContain('Historique du transfert');expect(text()).toContain('Transfert résolu');expect(fixture.nativeElement.querySelector('textarea[formControlName="note"]')).toBeNull();expect(button('Résoudre le transfert')).toBeUndefined();expect(button('Annuler le transfert')).toBeUndefined();
 });
 it('provides an explicit active-handoff button when inspecting a different historical handoff',()=>{
  const active=record({status:'assigned',operator:'Fictif'}),past=record({id:'old',status:'resolved'});api.escalations.mockReturnValue(of({active,items:[past,active],total:2}));c.load();fixture.detectChanges();
  const historical=fixture.nativeElement.querySelector('nav button.row') as HTMLButtonElement;historical.click();fixture.detectChanges();expect(c.selected()?.id).toBe('old');button('Ouvrir le transfert actif').click();fixture.detectChanges();expect(c.selected()?.id).toBe('e');expect(button('Résoudre le transfert')).toBeDefined();expect(api.updateEscalation).not.toHaveBeenCalled();
 });
 it('does not overwrite a creation draft, treatment draft, confirmation or error when an older list returns',()=>{
  const active=record({status:'assigned',operator:'Fictif'}),pending=new Subject<any>();api.escalations.mockReturnValueOnce(pending);c.load();
  c.inspect(active);fixture.detectChanges();const note=fixture.nativeElement.querySelector('textarea[formControlName="note"]') as HTMLTextAreaElement;note.value='À garder';note.dispatchEvent(new Event('input'));fixture.detectChanges();c.review('resolve');c.error.set('handoff.failed');
  pending.next({active:{...active,version:2},items:[{...active,version:2}],total:1});fixture.detectChanges();expect(c.selected()?.version).toBe(1);expect(c.treatment.controls.note.value).toBe('À garder');expect(c.confirmation()).toBe('resolve');expect(c.error()).toBe('handoff.failed');
  c.cancelDraft();c.cancelDraft();c.selected.set(null);c.active.set(null);const creatingList=new Subject<any>();c.start();c.request.controls.details.setValue('Brouillon création');api.escalations.mockReturnValueOnce(creatingList);c.load();creatingList.next({active,items:[active],total:1});expect(c.creating()).toBe(true);expect(c.selected()).toBeNull();expect(c.request.controls.details.value).toBe('Brouillon création');expect(api.updateEscalation).not.toHaveBeenCalled();
 });
 it('keeps an updated selection when a stale list arrives after a successful assignment',()=>{
  const initial=record(),assigned=record({status:'assigned',operator:'Fictif',version:2});c.inspect(initial);c.treatment.controls.operator.setValue('Fictif');c.review('assign');api.updateEscalation.mockReturnValueOnce(of(assigned));api.escalations.mockReturnValueOnce(of({active:initial,items:[initial],total:1}));c.submit();expect(c.selected()).toEqual(assigned);
 });
 it('translates the explicit opener and handoff history without losing the selected row',async()=>{
  const active=record({status:'assigned'});api.escalations.mockReturnValue(of({active,items:[active],total:1}));c.load();c.inspect(record({id:'past',status:'resolved'}));fixture.detectChanges();await TestBed.inject(UiLanguageService).use('en');fixture.detectChanges();expect(text()).toContain('Open active handoff');expect(text()).toContain('Handoff history');expect(c.selected()?.id).toBe('past');expect(api.updateEscalation).not.toHaveBeenCalled();
 });

});
