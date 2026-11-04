import { errorInterceptor } from '../interceptors/error.interceptor';
import { ErrorService } from './error.service';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors, HttpErrorResponse } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SupportTicketService } from './support-ticket.service';

describe('SupportTicketService', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideHttpClient(withInterceptors([errorInterceptor])), provideHttpClientTesting()] }));
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  it('uses only scoped ticket endpoints with explicit filters, paging and no AI requests', () => {
    const service = TestBed.inject(SupportTicketService), http = TestBed.inject(HttpTestingController);
    service.list('agent', { category: 'defective_product', status: 'open', priority: '', search: 'NS-2026-1042', conversationId: 'conversation' }, 25).subscribe();
    const list = http.expectOne(r=>r.url==='http://localhost:3000/api/agents/agent/tickets');
    expect(list.request.params.get('offset')).toBe('25');expect(list.request.params.get('category')).toBe('defective_product');expect(list.request.params.has('priority')).toBe(false);expect(list.request.params.get('conversationId')).toBe('conversation');list.flush({items:[]});
    const payload={requestId:'request',title:'Casque',description:'Défectueux',conversationId:null,sourceMessageId:null};service.create('agent',payload).subscribe();
    const post=http.expectOne('http://localhost:3000/api/agents/agent/tickets');expect(post.request.method).toBe('POST');expect(post.request.body).toEqual(payload);post.flush({id:'ticket'});
    service.get('agent','ticket').subscribe();http.expectOne('http://localhost:3000/api/agents/agent/tickets/ticket').flush({id:'ticket'});
    service.update('agent','ticket',{version:1,status:'in_progress',priority:'high',category:'defective_product'}).subscribe();const patch=http.expectOne('http://localhost:3000/api/agents/agent/tickets/ticket');expect(patch.request.method).toBe('PATCH');expect(patch.request.body.version).toBe(1);patch.flush({});
    service.events('agent','ticket',25).subscribe();http.expectOne(r=>r.url.endsWith('/ticket/events')&&r.params.get('offset')==='25').flush({items:[]});http.expectNone(r=>/ask|messages|chat|generate/.test(r.url));
  });
  it('preserves structured conflicts through the real interceptor while still showing a localized global notification',()=>{
    const service=TestBed.inject(SupportTicketService),http=TestBed.inject(HttpTestingController);let error:HttpErrorResponse|undefined;
    service.update('agent','ticket',{version:1,status:'in_progress',priority:'medium',category:'defective_product'}).subscribe({error:e=>error=e});
    http.expectOne('http://localhost:3000/api/agents/agent/tickets/ticket').flush({code:'version_conflict',error:'Do not display server wording'},{status:409,statusText:'Conflict'});
    expect(error instanceof HttpErrorResponse).toBe(true);expect(error?.status).toBe(409);expect(error?.error.code).toBe('version_conflict');expect(TestBed.inject(ErrorService).presentation()?.key).toBe('errors.conflict');
  });

});
