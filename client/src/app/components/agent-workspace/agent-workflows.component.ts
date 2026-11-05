import {Component,DestroyRef,EventEmitter,Input,OnChanges,Output,inject,signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {forkJoin,timeout} from 'rxjs';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {TranslocoPipe} from '@jsverse/transloco';
import {UiDatePipe} from '../../i18n/ui-format.pipe';
import {UiLanguageService} from '../../i18n/ui-language.service';
import {WorkflowManagementService} from '../../services/workflow-management.service';
import {WORKFLOW_STATES,WorkflowOverview,WorkflowRun,WorkflowReceipt,WorkflowAudit} from '../../models/workflow-management.model';
@Component({selector:'app-agent-workflows',standalone:true,imports:[FormsModule,TranslocoPipe,UiDatePipe],templateUrl:'./agent-workflows.component.html',styleUrl:'./agent-workflows.component.scss'})
export class AgentWorkflowsComponent implements OnChanges {
 @Input({required:true}) agentId!:string;@Output() dirtyChange=new EventEmitter<boolean>();@Output() busyChange=new EventEmitter<boolean>();
 private api=inject(WorkflowManagementService);private destroy=inject(DestroyRef);readonly ui=inject(UiLanguageService);readonly states=WORKFLOW_STATES;
 readonly overview=signal<WorkflowOverview|null>(null);readonly runs=signal<WorkflowRun[]>([]);readonly receipts=signal<WorkflowReceipt[]>([]);readonly selected=signal<WorkflowRun|null>(null);readonly events=signal<WorkflowAudit[]>([]);
 readonly loading=signal(false);readonly busy=signal(false);readonly error=signal('');readonly message=signal('');readonly runTotal=signal(0);readonly offset=signal(0);readonly receiptTotal=signal(0);readonly receiptOffset=signal(0);readonly eventTotal=signal(0);readonly historyLoading=signal(false);readonly historyError=signal(false);readonly receiptEvents=signal<WorkflowAudit[]>([]);readonly receiptEventTotal=signal(0);readonly inspectedReceipt=signal<WorkflowReceipt|null>(null);
 readonly pending=signal<{action:string;path:string;body:Record<string,unknown>;key:string}|null>(null);
 readonly capacityDirty=signal(false);
 filter='';search='';capacity=1000;private previous='';private epoch=0;private listId=0;private detailId=0;private historyId=0;private receiptHistoryId=0;
 constructor(){this.destroy.onDestroy(()=>{this.epoch++;this.dirtyChange.emit(false);this.busyChange.emit(false);});}
 ngOnChanges(){if(this.previous===this.agentId)return;this.previous=this.agentId;this.epoch++;this.listId++;this.detailId++;this.historyId++;this.receiptHistoryId++;this.overview.set(null);this.selected.set(null);this.events.set([]);this.eventTotal.set(0);this.historyLoading.set(false);this.historyError.set(false);this.runTotal.set(0);this.receiptTotal.set(0);this.receiptEventTotal.set(0);this.inspectedReceipt.set(null);this.receiptEvents.set([]);this.receipts.set([]);this.runs.set([]);this.filter='';this.search='';this.offset.set(0);this.receiptOffset.set(0);this.pending.set(null);this.capacityDirty.set(false);this.loading.set(false);this.setBusy(false);this.dirtyChange.emit(false);this.load();}
 private setBusy(value:boolean){this.busy.set(value);this.busyChange.emit(value);}
 load(offset=this.offset(),receiptOffset=this.receiptOffset()){if(this.busy()||this.pending()||this.capacityDirty())return;const epoch=this.epoch,id=++this.listId;this.loading.set(true);this.error.set('');forkJoin({overview:this.api.overview(this.agentId),runs:this.api.runs(this.agentId,this.filter,this.search,offset),receipts:this.api.receipts(this.agentId,receiptOffset)}).pipe(timeout(15000),takeUntilDestroyed(this.destroy)).subscribe({next:p=>{if(epoch!==this.epoch||id!==this.listId)return;this.overview.set(p.overview);if(!this.capacityDirty())this.capacity=p.overview.settings.capacity;this.runs.set(p.runs.items);this.runTotal.set(p.runs.total);this.offset.set(p.runs.offset);this.receipts.set(p.receipts.items);this.receiptTotal.set(p.receipts.total);this.receiptOffset.set(p.receipts.offset);this.loading.set(false);},error:()=>{if(epoch===this.epoch&&id===this.listId){this.loading.set(false);this.error.set('automation.loadFailed');}}});}
 applyFilters(){this.load(0);}
 page(delta:number){const next=this.offset()+25*delta;if(next>=0&&next<this.runTotal())this.load(next);}
 receiptPage(delta:number){const next=this.receiptOffset()+25*delta;if(next>=0&&next<this.receiptTotal())this.load(this.offset(),next);}
 open(row:WorkflowRun){if(this.pending()||this.busy())return;const epoch=this.epoch,id=++this.detailId;this.setBusy(true);this.error.set('');this.api.detail(this.agentId,row.id).pipe(timeout(15000),takeUntilDestroyed(this.destroy)).subscribe({next:detail=>{if(epoch!==this.epoch||id!==this.detailId)return;this.selected.set(detail);this.historyId++;this.historyLoading.set(false);this.events.set([]);this.setBusy(false);this.loadHistory();},error:()=>{if(epoch===this.epoch&&id===this.detailId){this.setBusy(false);this.error.set('automation.loadFailed');}}});}
 loadHistory(more=false){const row=this.selected();if(!row||this.historyLoading())return;const epoch=this.epoch,id=++this.historyId;this.historyLoading.set(true);this.historyError.set(false);this.api.history(this.agentId,row.id,more?this.events().length:0).pipe(timeout(15000),takeUntilDestroyed(this.destroy)).subscribe({next:p=>{if(epoch!==this.epoch||id!==this.historyId)return;this.events.set(more?[...this.events(),...p.items]:p.items);this.eventTotal.set(p.total);this.historyLoading.set(false);},error:()=>{if(epoch===this.epoch&&id===this.historyId){this.historyLoading.set(false);this.historyError.set(true);}}});}
 inspectReceipt(row:WorkflowReceipt,more=false){const epoch=this.epoch,id=++this.receiptHistoryId;if(!more){this.inspectedReceipt.set(row);this.receiptEvents.set([]);}this.api.receiptHistory(this.agentId,row.id,more?this.receiptEvents().length:0).pipe(timeout(15000),takeUntilDestroyed(this.destroy)).subscribe({next:p=>{if(epoch!==this.epoch||id!==this.receiptHistoryId)return;this.receiptEvents.set(more?[...this.receiptEvents(),...p.items]:p.items);this.receiptEventTotal.set(p.total);},error:()=>{if(epoch===this.epoch&&id===this.receiptHistoryId)this.error.set('automation.loadFailed');}});}
 editCapacity(){this.capacityDirty.set(true);this.dirtyChange.emit(true);}
 review(action:string,row?:WorkflowRun|WorkflowReceipt){if(this.capacityDirty()&&action!=='dispatcher'){this.error.set('automation.unsaved');return;}if(this.pending()||this.busy()||this.loading())return;const data=this.overview();if(!data)return;let path='',body:Record<string,unknown>={};
  if(action==='create')path='bindings';
  else if(action==='binding'){if(!data.binding)return;path=`bindings/${data.binding.id}/state`;body={expectedVersion:data.binding.revision,enabled:!data.binding.enabled};}
  else if(action==='dispatcher'){if(!Number.isInteger(this.capacity)||this.capacity<1||this.capacity>10000){this.error.set('automation.invalid');return;}path='dispatcher';body={expectedVersion:data.settings.version,enabled:!data.settings.enabled,capacity:this.capacity};}
  else if(action==='prepare'){if(!data.binding)return;path='prepare';body={expectedVersion:data.binding.revision};}
  else if(row){path=action==='receiptResume'?`receipts/${encodeURIComponent(row.id)}/resume`:`runs/${row.id}/${action}`;body={expectedVersion:row.version};}else return;
  this.pending.set({action,path,body,key:crypto.randomUUID()});this.message.set('');this.error.set('');this.dirtyChange.emit(true);
 }
 cancel(){if(this.busy())return;this.pending.set(null);this.capacityDirty.set(false);this.capacity=this.overview()?.settings.capacity??1000;this.dirtyChange.emit(false);}
 submit(){const p=this.pending();if(!p||this.busy())return;const epoch=this.epoch;this.setBusy(true);this.error.set('');this.api.command(this.agentId,p.path,{...p.body,requestId:p.key,confirm:true}).pipe(timeout(15000),takeUntilDestroyed(this.destroy)).subscribe({next:()=>{if(epoch!==this.epoch)return;this.setBusy(false);this.cancel();this.selected.set(null);this.historyId++;this.events.set([]);this.message.set('automation.saved');this.load();},error:e=>{if(epoch!==this.epoch)return;this.setBusy(false);this.error.set(e.status===409?'automation.conflict':e.status===400?'automation.invalid':e.status===403?'automation.forbidden':'automation.failed');}});}
 total(values:Record<string,number>){return Object.values(values).reduce((n,v)=>n+v,0);}
 canSimulate(row:WorkflowRun){return ['queued','retry_wait'].includes(row.state);}
 canResume(row:WorkflowRun){return ['paused','unknown','failed'].includes(row.state)&&row.attempts<3;}
}
