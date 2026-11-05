export const WORKFLOW_STATES=['queued','running','retry_wait','paused','succeeded','failed','unknown','cancelled'] as const;
export interface LocalBinding {id:string;enabled:number;revision:number;target:'local_simulator';event_type:`${'handoff'}.${'requested'}`;}
export interface WorkflowOverview {binding:LocalBinding|null;settings:{enabled:number;capacity:number;version:number};receipts:Record<string,number>;runs:Record<string,number>;lastActivity:number|null;}
export interface WorkflowRun {id:string;receipt_id:string;state:string;version:number;fence:number;attempts:number;created_at:number;lease_until:number|null;next_attempt_at:number;event:string;ticketId:string;handoffId:string;sourceEventId:number;bindingRevision:number;lastError:string|null;result:string|null;}
export interface WorkflowReceipt {id:string;version:number;state:string;ticket_id:string;handoff_id:string;created_at:number;}
export interface WorkflowAudit {id:number;type:string;old_state:string|null;new_state:string|null;version:number|null;fence:number|null;created_at:number;}
export interface WorkflowPage<T>{items:T[];total:number;limit:number;offset:number;}
