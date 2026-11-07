import { UiLanguageService } from '../../i18n/ui-language.service';
import { provideUiI18nTesting } from '../../i18n/ui-i18n.testing';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { AgentConversationsComponent } from './agent-conversations.component';
import { AgentService } from '../../services/agent.service';
import { ConversationHistory, ConversationTurn, SupportAgent, SupportConversation, emptySupportAgent } from '../../models/support-agent.model';
const agent=(id='a'):SupportAgent=>({...emptySupportAgent(),id,name:'Support',status:'active',version:1,createdAt:'2026-01-01',updatedAt:'2026-01-01'});
const conversation=(id='c'):SupportConversation=>({id,agent_id:'a',title:'Retours',status:'open',created_at:'2026-01-01',updated_at:'2026-01-01'});
const history=(status:'completed'|'pending'|'failed'|'abstained'='completed'):ConversationHistory=>({conversation:conversation(),nextBefore:null,items:[{id:'m',sequence:2,requestId:'r',role:'assistant',status,content:'Retour autorisé [S1]',createdAt:'2026-01-01',stale:false,metadata:{code:'interrupted'},sources:status==='completed'?[{label:'S1',documentId:1,chunkId:1,filename:'policy.txt',excerpt:'Politique vérifiable',pageNumber:null,startOffset:0,endOffset:20}]:[]}]});
describe('AgentConversationsComponent',()=>{
  let fixture:ComponentFixture<AgentConversationsComponent>, component:AgentConversationsComponent;
  let api:Record<'listConversations'|'getConversation'|'createConversation'|'sendConversationMessage'|'deleteConversation',jest.Mock>;
  const text=()=>fixture.nativeElement.textContent as string;
  const button=(label:string)=>(Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[]).find(b=>b.textContent?.trim()===label)!;
  beforeEach(async()=>{
    Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: jest.fn().mockReturnValue('00000000-0000-4000-8000-000000000001') });
    api={listConversations:jest.fn().mockReturnValue(of({items:[],total:0})),getConversation:jest.fn().mockReturnValue(of(history())),createConversation:jest.fn().mockReturnValue(of(conversation())),sendConversationMessage:jest.fn().mockReturnValue(of({items:history().items})),deleteConversation:jest.fn().mockReturnValue(of(undefined))};
    await TestBed.configureTestingModule({ imports:[AgentConversationsComponent],providers:[...provideUiI18nTesting(),{provide:AgentService,useValue:api}]}).compileComponents();
    fixture=TestBed.createComponent(AgentConversationsComponent);component=fixture.componentInstance;fixture.componentRef.setInput('agent',agent());fixture.detectChanges();
  });
  it('loads server list, shows empty state and explains plaintext storage',()=>{
    expect(api.listConversations).toHaveBeenCalledWith('a',0);expect(text()).toContain('Aucun échange');expect(text()).toContain('en clair');expect(text()).toContain('200 messages');
  });
  it('creates from rendered control and displays citations without interpreting HTML',()=>{
    button('+ Nouvelle conversation').click();fixture.detectChanges();expect(api.createConversation).toHaveBeenCalledWith('a');expect(component.conversations().map(item=>item.id)).toEqual(['c']);expect(component.total()).toBe(1);expect(api.getConversation).toHaveBeenCalledWith('a','c',undefined);
    expect(text()).toContain('Retour autorisé');expect(fixture.nativeElement.querySelector('.messages .citation summary').textContent).toContain('policy.txt');
    component.messages.set([{...history().items[0],content:'<img src=x onerror=alert(1)>'}]);fixture.detectChanges();expect(fixture.nativeElement.querySelector('img')).toBeNull();expect(text()).toContain('<img');
  });
  it('selects and reloads persisted conversations without mixing messages',()=>{
    api.listConversations.mockReturnValue(of({items:[conversation(),conversation('d')],total:2}));component.loadList();fixture.detectChanges();
    fixture.nativeElement.querySelector('.select').click();fixture.detectChanges();expect(text()).toContain('Retour autorisé');
    api.getConversation.mockReturnValue(of({...history(),conversation:conversation('d'),items:[]}));fixture.nativeElement.querySelectorAll('.select')[1].click();fixture.detectChanges();expect(text()).not.toContain('Retour autorisé');
    component.read();expect(api.getConversation).toHaveBeenLastCalledWith('a','d',undefined);
  });
  it('submits through the form and prevents duplicate sends while pending',()=>{
    component.open(conversation());const pending=new Subject<ConversationTurn>();api.sendConversationMessage.mockReturnValue(pending);component.question.setValue('Et ouvert ?');fixture.detectChanges();
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));fixture.detectChanges();expect(component.sending()).toBe(true);expect(button('Génération…').disabled).toBe(true);
    component.send();expect(api.sendConversationMessage).toHaveBeenCalledTimes(1);pending.next({items:history().items});fixture.detectChanges();expect(component.question.value).toBe('');expect(component.sending()).toBe(false);
  });
  it.each(['abstained','failed'] as const)('renders %s explicitly',status=>{
    api.getConversation.mockReturnValue(of(history(status)));component.open(conversation());fixture.detectChanges();expect(text()).toContain(status==='abstained'?'Abstention':'Réponse non générée');
  });
  it('keeps text and idempotency key after an uncertain network outcome',()=>{
    component.open(conversation());component.question.setValue('retour article');api.sendConversationMessage.mockReturnValue(throwError(()=>new Error('offline')));component.send();fixture.detectChanges();
    const id=api.sendConversationMessage.mock.calls[0][3];expect(text()).toContain('Envoi non confirmé');expect(component.question.value).toBe('retour article');component.send();expect(api.sendConversationMessage.mock.calls[1][3]).toBe(id);
  });
  it('requires confirmation then deletes through the server and clears messages',()=>{
    component.open(conversation());component.confirming.set(conversation());fixture.detectChanges();expect(api.deleteConversation).not.toHaveBeenCalled();button('Confirmer la suppression').click();fixture.detectChanges();
    expect(api.deleteConversation).toHaveBeenCalledWith('a','c');expect(component.selected()).toBeNull();expect(component.messages()).toEqual([]);
  });
  it('clears prior-agent messages and ignores late old-agent responses',()=>{
    const pending=new Subject<ConversationHistory>();api.getConversation.mockReturnValue(pending);component.open(conversation());fixture.componentRef.setInput('agent',agent('b'));fixture.detectChanges();pending.next(history());fixture.detectChanges();
    expect(api.listConversations).toHaveBeenLastCalledWith('b',0);expect(component.messages()).toEqual([]);expect(component.selected()).toBeNull();
  });
  it('allows inactive history but disables new conversations and generation',()=>{
    fixture.componentRef.setInput('agent',{...agent(),status:'inactive'});fixture.detectChanges();component.open(conversation());component.question.setValue('question');fixture.detectChanges();expect(text()).toContain('Agent inactif');expect(button('+ Nouvelle conversation').disabled).toBe(true);expect(button('Envoyer').disabled).toBe(true);component.send();expect(api.sendConversationMessage).not.toHaveBeenCalled();
  });
  it('recovers pending status by polling and cancels on destruction',fakeAsync(()=>{
    api.getConversation.mockReturnValue(of(history('pending')));component.open(conversation());expect(component.sending()).toBe(true);tick(1500);expect(api.getConversation).toHaveBeenCalledTimes(2);fixture.destroy();tick(3000);expect(api.getConversation).toHaveBeenCalledTimes(2);
  }));
  it('shows failed reads and deletion without discarding known history',()=>{
    component.open(conversation());component.confirming.set(conversation());api.deleteConversation.mockReturnValue(throwError(()=>new Error('offline')));component.remove();fixture.detectChanges();expect(text()).toContain('Suppression impossible');expect(component.messages()).toHaveLength(1);
    api.getConversation.mockReturnValue(throwError(()=>new Error('offline')));component.read();fixture.detectChanges();expect(text()).toContain('Historique indisponible');
  });
  it('prepends older pages and flags revoked citations',()=>{
    component.open(conversation());component.nextBefore.set(2);api.getConversation.mockReturnValue(of({...history(),items:[{...history().items[0],id:'old',sequence:1,stale:true,sources:[],content:'Réponse masquée'}]}));component.read(true);fixture.detectChanges();expect(api.getConversation).toHaveBeenLastCalledWith('a','c',2);expect(component.messages().map(m=>m.id)).toEqual(['old','m']);expect(text()).toContain('Source révoquée');
  });
  it('keeps the selected chat and unsent draft mounted when folding the list and switching language', async () => {
    component.open(conversation());component.question.setValue('Question conservée');component.question.markAsDirty();fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('#conversation-question');
    const selected = component.selected();const messages = component.messages();const reads = api.getConversation.mock.calls.length;
    component.showList.set(true);fixture.detectChanges();
    fixture.nativeElement.querySelector('.mobile-switch').click();fixture.detectChanges();expect(component.showList()).toBe(false);
    expect(component.question.value).toBe('Question conservée');expect(component.question.dirty).toBe(true);
    fixture.nativeElement.querySelector('.mobile-switch').click();fixture.detectChanges();expect(component.showList()).toBe(true);
    const help: HTMLDetailsElement = fixture.nativeElement.querySelector('.context-help');
    expect(help.open).toBe(false);help.open = true;
    await TestBed.inject(UiLanguageService).use('en');fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#conversation-question')).toBe(input);
    expect(component.selected()).toBe(selected);expect(component.messages()).toBe(messages);
    expect(component.question.value).toBe('Question conservée');expect(component.question.dirty).toBe(true);
    expect(text()).toContain('Prepare a ticket');expect(text()).toContain('Retour autorisé');
    expect(api.getConversation).toHaveBeenCalledTimes(reads);
    expect(api.sendConversationMessage).not.toHaveBeenCalled();expect(api.createConversation).not.toHaveBeenCalled();
    expect(api.deleteConversation).not.toHaveBeenCalled();
  });
  it('only emits a ticket draft from the rendered action and keeps messages and input unchanged', () => {
    component.open(conversation());
    component.messages.set([{...history().items[0],id:'user-message',role:'user',content:'Produit défectueux NS-2026-1042',sources:[]},...history().items]);
    component.question.setValue('Brouillon à conserver');fixture.detectChanges();
    const draft = jest.fn();component.createTicket.subscribe(draft);
    expect(draft).not.toHaveBeenCalled();button('Préparer un ticket').click();
    expect(draft).toHaveBeenCalledWith(expect.objectContaining({description:'Produit défectueux NS-2026-1042',sourceMessageId:'user-message'}));
    expect(component.messages()).toHaveLength(2);expect(component.question.value).toBe('Brouillon à conserver');
    expect(fixture.nativeElement.querySelector('article.user').textContent).toContain('Produit défectueux');
    expect(fixture.nativeElement.querySelector('.messages .citation summary').textContent).toContain('policy.txt');
    expect(api.sendConversationMessage).not.toHaveBeenCalled();expect(api.createConversation).not.toHaveBeenCalled();
    expect(api.deleteConversation).not.toHaveBeenCalled();
  });

  it('renders separate message roles and a single keyboard-focusable sources disclosure per reply', () => {
    component.open(conversation());component.messages.set([{...history().items[0],id:'u',role:'user',content:'Question conservée',sources:[]},...history().items]);fixture.detectChanges();
    const messages=fixture.nativeElement.querySelectorAll('.messages article');
    expect(messages[0].classList.contains('user')).toBe(true);expect(messages[1].classList.contains('user')).toBe(false);
    const sources:HTMLDetailsElement=fixture.nativeElement.querySelector('.sources');
    expect(fixture.nativeElement.querySelectorAll('.sources')).toHaveLength(1);expect(sources.open).toBe(false);
    const summary=sources.querySelector('summary')!;expect(summary.textContent).toContain('Sources (1)');
    summary.focus();expect(document.activeElement).toBe(summary);
    const reads=api.getConversation.mock.calls.length;sources.open=true;
    const citation:HTMLDetailsElement=sources.querySelector('.citation')!;citation.open=true;fixture.detectChanges();
    expect(citation.textContent).toContain('Politique vérifiable');expect(citation.textContent).toContain('Document 1');
    expect(component.messages().map(message=>message.id)).toEqual(['u','m']);expect(api.getConversation).toHaveBeenCalledTimes(reads);
    expect(api.sendConversationMessage).not.toHaveBeenCalled();
  });
  it('preserves an unsent draft when the rendered list or new-conversation action is used', () => {
    api.listConversations.mockReturnValue(of({items:[conversation(),conversation('d')],total:2}));component.loadList();component.open(conversation());
    component.question.setValue('Ne pas perdre');component.question.markAsDirty();component.showList.set(true);fixture.detectChanges();
    const reads=api.getConversation.mock.calls.length;
    fixture.nativeElement.querySelectorAll('.select')[1].click();fixture.detectChanges();
    expect(component.selected()?.id).toBe('c');expect(component.question.value).toBe('Ne pas perdre');expect(component.question.dirty).toBe(true);
    expect(text()).toContain('Un message n’a pas été envoyé');expect(api.getConversation).toHaveBeenCalledTimes(reads);
    button('+ Nouvelle conversation').click();expect(api.createConversation).not.toHaveBeenCalled();
    fixture.nativeElement.querySelector('.select').click();fixture.detectChanges();expect(component.showList()).toBe(false);
    expect(component.question.value).toBe('Ne pas perdre');expect(api.getConversation).toHaveBeenCalledTimes(reads);
  });
  it('follows new messages only near the bottom and anchors older pages with simulated viewport geometry', () => {
    component.open(conversation());fixture.detectChanges();
    const viewport:HTMLElement=fixture.nativeElement.querySelector('.messages');let height=1000,top=0;
    Object.defineProperties(viewport,{clientHeight:{configurable:true,get:()=>200},scrollHeight:{configurable:true,get:()=>height},scrollTop:{configurable:true,get:()=>top,set:(value:number)=>{top=Math.max(0,Math.min(value,height-200));}}});
    component.syncHistoryScroll();expect(top).toBe(800);
    viewport.scrollTop=200;viewport.dispatchEvent(new Event('scroll'));
    height=1200;component.messages.update(messages=>[...messages,{...history().items[0],id:'new',sequence:3}]);fixture.detectChanges();component.syncHistoryScroll();expect(top).toBe(200);
    height=1400;component.messages.update(messages=>[{...history().items[0],id:'older',sequence:1},...messages]);fixture.detectChanges();component.syncHistoryScroll();expect(top).toBe(400);
    component.latestMessages();expect(top).toBe(1200);
    height=1600;component.messages.update(messages=>[...messages,{...history().items[0],id:'latest',sequence:4}]);fixture.detectChanges();component.syncHistoryScroll();expect(top).toBe(1400);
    expect(api.sendConversationMessage).not.toHaveBeenCalled();expect(api.createConversation).not.toHaveBeenCalled();
  });

  it('sizes the chat from its actual top position and recalculates on resize without mutations', () => {
    const host:HTMLElement=fixture.nativeElement;
    const layout:HTMLElement=host.querySelector('.conversation-layout');
    jest.spyOn(host,'getClientRects').mockReturnValue([{height:1}] as unknown as DOMRectList);
    jest.spyOn(layout,'getBoundingClientRect').mockReturnValue({top:250} as DOMRect);
    component.updateAvailableHeight();
    expect(host.style.getPropertyValue('--chat-space')).toBe(`${Math.max(320,window.innerHeight-270)}px`);
    jest.spyOn(layout,'getBoundingClientRect').mockReturnValue({top:350} as DOMRect);
    window.dispatchEvent(new Event('resize'));
    expect(host.style.getPropertyValue('--chat-space')).toBe(`${Math.max(320,window.innerHeight-370)}px`);
    expect(api.sendConversationMessage).not.toHaveBeenCalled();
    expect(api.createConversation).not.toHaveBeenCalled();
  });

});
