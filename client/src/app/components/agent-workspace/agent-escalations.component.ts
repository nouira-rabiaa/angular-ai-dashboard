import { Component, DestroyRef, EventEmitter, Input, OnChanges, Output, inject, signal, HostListener } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { timeout } from 'rxjs';
import { TranslocoPipe } from '@jsverse/transloco';
import { UiDatePipe } from '../../i18n/ui-format.pipe';
import { SupportTicketService } from '../../services/support-ticket.service';
import { ESCALATION_REASONS, EscalationAction, EscalationEvent, SupportEscalation } from '../../models/support-escalation.model';
@Component({selector:'app-agent-escalations',standalone:true,imports:[ReactiveFormsModule,TranslocoPipe,UiDatePipe],templateUrl:'./agent-escalations.component.html',styleUrl:'./agent-escalations.component.scss'})
export class AgentEscalationsComponent implements OnChanges {
 @Input({required:true}) agentId!:string;@Input({required:true}) ticketId!:string;
 @Output() dirtyChange=new EventEmitter<boolean>();@Output() busyChange=new EventEmitter<boolean>();
 private api=inject(SupportTicketService);private destroy=inject(DestroyRef);private fb=inject(FormBuilder).nonNullable;
 readonly reasons=ESCALATION_REASONS;readonly request=this.fb.group({reason:['refund_validation',[Validators.required]],details:['',[Validators.maxLength(2000)]]});
 readonly treatment=this.fb.group({operator:['',[Validators.maxLength(100)]],note:['',[Validators.maxLength(4000)]]});
 readonly items=signal<SupportEscalation[]>([]);readonly active=signal<SupportEscalation|null>(null);readonly selected=signal<SupportEscalation|null>(null);readonly total=signal(0);
 readonly loading=signal(false);readonly busy=signal(false);readonly error=signal('');readonly success=signal(false);readonly creating=signal(false);readonly confirmation=signal<'request'|EscalationAction|null>(null);
 readonly events=signal<EscalationEvent[]>([]);readonly eventTotal=signal(0);readonly eventLoading=signal(false);readonly eventError=signal(false);
 private epoch=0;private eventEpoch=0;private listEpoch=0;private retry?:{payload:string;requestId:string};private context='';
 constructor(){this.request.valueChanges.pipe(takeUntilDestroyed()).subscribe(()=>this.notify());this.treatment.valueChanges.pipe(takeUntilDestroyed()).subscribe(()=>this.notify());this.destroy.onDestroy(()=>{this.epoch++;this.dirtyChange.emit(false);this.busyChange.emit(false);});}
 ngOnChanges(){const key=this.agentId+':'+this.ticketId;if(key===this.context)return;this.context=key;this.epoch++;this.eventEpoch++;this.listEpoch++;this.items.set([]);this.active.set(null);this.selected.set(null);this.events.set([]);this.eventTotal.set(0);this.total.set(0);this.loading.set(false);this.eventLoading.set(false);this.reset();this.load();}
 dirty(){return this.creating()||this.treatment.dirty;}
 private notify(){this.dirtyChange.emit(this.dirty());}
 @HostListener('window:beforeunload',['$event']) beforeUnload(event:BeforeUnloadEvent){if(this.dirty()||this.busy())event.preventDefault();}
 private setBusy(value:boolean){this.busy.set(value);this.busyChange.emit(value);}
 private reset(){this.request.reset({reason:'refund_validation',details:''});this.treatment.reset({operator:'',note:''});this.confirmation.set(null);this.creating.set(false);this.retry=undefined;this.error.set('');this.success.set(false);this.setBusy(false);this.notify();}
 load(more=false){
  if(this.loading()||this.busy())return;
  const epoch=this.epoch,listEpoch=++this.listEpoch;
  this.loading.set(true);
  if(!this.dirty()&&!this.confirmation())this.error.set('');
  this.api.escalations(this.agentId,this.ticketId,more?this.items().length:0).pipe(timeout(15000),takeUntilDestroyed(this.destroy)).subscribe({
   next:p=>{
    if(epoch!==this.epoch||listEpoch!==this.listEpoch)return;
    this.items.set(more?[...this.items(),...p.items]:p.items);this.active.set(p.active);this.total.set(p.total);this.loading.set(false);
    if(this.dirty()||this.confirmation()||this.busy())return;
    const selected=this.selected();
    if(!selected&&p.active)this.inspect(p.active);
    else if(selected&&!more){
     const fresh=p.items.find(row=>row.id===selected.id)??(p.active?.id===selected.id?p.active:null);
     if(fresh&&fresh.version>selected.version)this.inspect(fresh);
    }
   },
   error:()=>{if(epoch===this.epoch&&listEpoch===this.listEpoch){this.loading.set(false);if(!this.dirty()&&!this.confirmation())this.error.set('handoff.loadFailed');}}
  });
 }
 openActive(){const current=this.active();if(current)this.inspect(current);}
 start(){if(this.busy()||this.dirty()||this.loading()||this.active())return;this.reset();this.creating.set(true);this.notify();}
 inspect(row:SupportEscalation){if(this.busy()||this.dirty()||this.confirmation())return;this.eventEpoch++;this.events.set([]);this.eventTotal.set(0);this.eventLoading.set(false);this.eventError.set(false);this.selected.set(row);this.treatment.reset({operator:row.operator??'',note:''});this.loadEvents();}
 cancelDraft(){if(this.busy())return;if(this.confirmation()){this.confirmation.set(null);return;}this.reset();}
 review(action:'request'|EscalationAction){if(this.busy())return;this.error.set('');
  if(action==='request'){this.request.markAllAsTouched();if(this.request.invalid||(this.request.controls.reason.value==='other'&&!this.request.controls.details.value.trim())){this.error.set('handoff.invalid');return;}}
  else {const row=this.selected();if(!row||!['requested','assigned'].includes(row.status)||(action==='assign'&&row.status!=='requested')||(action==='resolve'&&row.status!=='assigned')||this.treatment.invalid||(action==='assign'?!this.treatment.controls.operator.value.trim():!this.treatment.controls.note.value.trim())){this.error.set('handoff.invalid');return;}}
  this.confirmation.set(action);
 }
 submit(){const action=this.confirmation();if(!action||this.busy())return;const row=this.selected();if(action!=='request'&&!row)return;
  const data=action==='request'?{reason:this.request.controls.reason.value,details:this.request.controls.details.value.trim()}:{version:row!.version,action,...(action==='assign'?{operator:this.treatment.controls.operator.value.trim()}:{note:this.treatment.controls.note.value.trim()})};
  const payload=JSON.stringify({id:action==='request'?null:row!.id,data});if(this.retry?.payload!==payload)this.retry={payload,requestId:crypto.randomUUID()};const requestId=this.retry.requestId;
  const call=action==='request'?this.api.requestEscalation(this.agentId,this.ticketId,{...data,requestId} as {reason:string;details:string;requestId:string}):this.api.updateEscalation(this.agentId,this.ticketId,row!.id,{...data,requestId} as {version:number;action:string;requestId:string});
  const epoch=this.epoch;this.setBusy(true);this.error.set('');call.pipe(timeout(15000),takeUntilDestroyed(this.destroy)).subscribe({next:updated=>{if(epoch!==this.epoch)return;this.listEpoch++;this.loading.set(false);this.reset();this.inspect(updated);this.success.set(true);this.load();},error:e=>{if(epoch!==this.epoch)return;this.setBusy(false);this.error.set(e.status===409?'handoff.conflict':e.status===400?'handoff.invalid':e.status===403?'handoff.forbidden':'handoff.failed');}});
 }
 loadEvents(more=false){const row=this.selected();if(!row||this.eventLoading())return;const epoch=this.epoch,eventEpoch=this.eventEpoch;this.eventLoading.set(true);this.eventError.set(false);this.api.escalationEvents(this.agentId,this.ticketId,row.id,more?this.events().length:0).pipe(timeout(15000),takeUntilDestroyed(this.destroy)).subscribe({next:p=>{if(epoch!==this.epoch||eventEpoch!==this.eventEpoch)return;this.events.set(more?[...this.events(),...p.items]:p.items);this.eventTotal.set(p.total);this.eventLoading.set(false);},error:()=>{if(epoch===this.epoch&&eventEpoch===this.eventEpoch){this.eventLoading.set(false);this.eventError.set(true);}}});}
}
