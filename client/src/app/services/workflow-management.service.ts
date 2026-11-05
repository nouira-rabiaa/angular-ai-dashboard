import {inject,Injectable} from '@angular/core';
import {HttpClient,HttpContext} from '@angular/common/http';
import {PRESERVE_HTTP_ERROR} from '../interceptors/preserve-http-error';
import {WorkflowOverview,WorkflowRun,WorkflowReceipt,WorkflowAudit,WorkflowPage} from '../models/workflow-management.model';
@Injectable({providedIn:'root'})
export class WorkflowManagementService {
 private http=inject(HttpClient);private context=new HttpContext().set(PRESERVE_HTTP_ERROR,true);
 private url(agent:string){return `http://localhost:3000/api/agents/${encodeURIComponent(agent)}/workflow-automation`;}
 overview(agent:string){return this.http.get<WorkflowOverview>(this.url(agent),{context:this.context});}
 runs(agent:string,state='',search='',offset=0){return this.http.get<WorkflowPage<WorkflowRun>>(this.url(agent)+'/runs',{params:{limit:25,offset,...(state?{state}:{}),...(search?{search}:{})},context:this.context});}
 receipts(agent:string,offset=0){return this.http.get<WorkflowPage<WorkflowReceipt>>(this.url(agent)+'/receipts',{params:{limit:25,offset},context:this.context});}
 detail(agent:string,id:string){return this.http.get<WorkflowRun>(this.url(agent)+'/runs/'+encodeURIComponent(id),{context:this.context});}
 history(agent:string,id:string,offset=0){return this.http.get<WorkflowPage<WorkflowAudit>>(this.url(agent)+'/runs/'+encodeURIComponent(id)+'/history',{params:{limit:25,offset},context:this.context});}
 receiptHistory(agent:string,id:string,offset=0){return this.http.get<WorkflowPage<WorkflowAudit>>(this.url(agent)+'/receipts/'+encodeURIComponent(id)+'/history',{params:{limit:25,offset},context:this.context});}
 command(agent:string,path:string,body:Record<string,unknown>){return this.http.post<unknown>(this.url(agent)+'/'+path,body,{context:this.context});}
}
