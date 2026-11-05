import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { AgentConfigurationComponent } from './agent-configuration.component';
import { AgentConversationsComponent } from './agent-conversations.component';
import { AgentTicketsComponent } from './agent-tickets.component';
import { emptySupportAgent, ConversationMessage } from '../../models/support-agent.model';
import { provideUiI18nTesting } from '../../i18n/ui-i18n.testing';
import { UiLanguageService } from '../../i18n/ui-language.service';

const root='http://localhost:3000/api/agents';
const agent={...emptySupportAgent(),id:'00000000-0000-4000-8000-000000000001',name:'NovaShop (fictif)',version:1,status:'active',createdAt:'',updatedAt:''};
const conversation={id:'00000000-0000-4000-8000-000000000002',agent_id:agent.id,title:'Casque Bluetooth défectueux — NS-2026-1042',status:'open',created_at:'',updated_at:''};
const question:ConversationMessage={id:'00000000-0000-4000-8000-000000000003',sequence:1,requestId:'request',role:'user',content:'Sophie Martin (scénario fictif) : casque Bluetooth défectueux, commande NS-2026-1042.',status:'completed',createdAt:'',sources:[],stale:false,metadata:{}};
const counts={open:1,in_progress:0,waiting:0,resolved:0,closed:0};
describe('Support Studio — conversation to ticket integration',()=>{
  beforeEach(()=>{
    Object.defineProperty(crypto,'randomUUID',{configurable:true,value:jest.fn().mockReturnValue('00000000-0000-4000-8000-000000000004')});
    TestBed.configureTestingModule({imports:[AgentConfigurationComponent],providers:[...provideUiI18nTesting(),provideHttpClient(),provideHttpClientTesting()]});
  });
  afterEach(()=>TestBed.inject(HttpTestingController).verify());
  function openStudio(){
    const fixture=TestBed.createComponent(AgentConfigurationComponent),http=TestBed.inject(HttpTestingController);fixture.detectChanges();
    http.expectOne(root+'?limit=50&offset=0').flush({items:[agent],total:1,offset:0,limit:50});fixture.detectChanges();fixture.nativeElement.querySelector('.studio-agent').click();http.expectOne(root+'/'+agent.id).flush(agent);fixture.detectChanges();
    fixture.componentInstance.selectSpace('conversations');fixture.detectChanges();http.expectOne(root+'/'+agent.id+'/conversations?limit=30&offset=0').flush({items:[conversation],total:1});fixture.detectChanges();
    fixture.nativeElement.querySelector('.conversation-item .select').click();http.expectOne(root+'/'+agent.id+'/conversations/'+conversation.id+'?limit=30').flush({conversation,items:[question],nextBefore:null});fixture.detectChanges();
    const chat=fixture.debugElement.query(By.directive(AgentConversationsComponent)).componentInstance as AgentConversationsComponent;
    const go=()=>{(Array.from(fixture.nativeElement.querySelectorAll('.discussion button')) as HTMLButtonElement[]).find(b=>b.textContent?.includes('Créer un ticket'))!.click();fixture.detectChanges();http.expectOne(root+'/'+agent.id+'/tickets?limit=25&offset=0').flush({items:[],total:0,offset:0,limit:25,counts:{...counts,open:0}});http.expectOne(root+'/'+agent.id+'/conversations?limit=50&offset=0').flush({items:[conversation],total:1});fixture.detectChanges();return fixture.debugElement.query(By.directive(AgentTicketsComponent)).componentInstance as AgentTicketsComponent;};
    return{fixture,http,chat,go};
  }
  it('creates the fictitious NovaShop ticket after confirmation, preserves the mounted chat and uses no inference',async()=>{
    const{fixture,http,chat,go}=openStudio();chat.question.setValue('Brouillon non envoyé');chat.question.markAsDirty();const oldMessages=chat.messages();
    const tickets=go();expect(tickets.form.controls.description.value).toBe(question.content);expect(tickets.form.controls.conversationId.value).toBe(conversation.id);expect(tickets.sourceMessageId()).toBe(question.id);http.expectNone(r=>r.method==='POST');
    fixture.componentInstance.selectSpace('configuration');expect(fixture.componentInstance.activeSpace()).toBe('tickets');expect(fixture.componentInstance.ticketDirty()).toBe(true);
    const unload=new Event('beforeunload',{cancelable:true});fixture.componentInstance.beforeUnload(unload as BeforeUnloadEvent);expect(unload.defaultPrevented).toBe(true);
    await TestBed.inject(UiLanguageService).use('en');fixture.detectChanges();expect(tickets.form.controls.description.value).toBe(question.content);expect(chat.question.value).toBe('Brouillon non envoyé');http.expectNone(()=>true);
    tickets.review();tickets.create();const post=http.expectOne(root+'/'+agent.id+'/tickets');expect(post.request.body).toEqual(expect.objectContaining({conversationId:conversation.id,sourceMessageId:question.id,title:conversation.title,description:question.content}));expect(post.request.body.category).toBeUndefined();
    const ticket={id:'ticket',agentId:agent.id,conversationId:conversation.id,sourceMessageId:question.id,title:conversation.title,description:question.content,category:'defective_product',priority:'medium',status:'open',classificationSource:'rules',classificationReason:'defective_product:keywords;medium:default',classificationConfidence:null,version:1,createdAt:'2026-11-04T10:00:00Z',updatedAt:'2026-11-04T10:00:00Z',closedAt:null};post.flush(ticket);
    http.expectOne(root+'/'+agent.id+'/tickets?limit=25&offset=0').flush({items:[ticket],total:1,offset:0,limit:25,counts});http.expectOne(root+'/'+agent.id+'/tickets/ticket/events?limit=25&offset=0').flush({items:[],total:0});fixture.detectChanges();http.expectOne(root+'/'+agent.id+'/tickets/ticket/escalations?limit=25&offset=0').flush({active:null,items:[],total:0,limit:25,offset:0});fixture.detectChanges();expect(fixture.nativeElement.textContent).toContain('Defective product');
    fixture.componentInstance.selectSpace('conversations');fixture.detectChanges();expect(fixture.debugElement.query(By.directive(AgentConversationsComponent)).componentInstance).toBe(chat);expect(chat.messages()).toBe(oldMessages);expect(chat.question.value).toBe('Brouillon non envoyé');http.expectNone(()=>true);
  });
  it('cancels only the ticket draft and retains the original conversation and unsent composer',()=>{
    const{fixture,http,chat,go}=openStudio();chat.question.setValue('À conserver');chat.question.markAsDirty();const messages=chat.messages();const tickets=go();tickets.cancel();fixture.detectChanges();expect(tickets.dirty()).toBe(false);expect(fixture.componentInstance.ticketDirty()).toBe(false);
    fixture.componentInstance.selectSpace('conversations');fixture.detectChanges();expect(chat.messages()).toBe(messages);expect(chat.question.value).toBe('À conserver');expect(chat.selected()?.id).toBe(conversation.id);
    // An explicit request to inspect a different conversation must not overwrite the unsent composer.
    fixture.componentInstance.requestedConversation.set({...conversation,id:'other'});fixture.detectChanges();expect(chat.selected()?.id).toBe(conversation.id);expect(chat.error()).toBe('tickets.conversationDraft');http.expectNone(()=>true);
  });
});
