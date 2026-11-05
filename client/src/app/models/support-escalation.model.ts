export const ESCALATION_REASONS = ['refund_validation','complex_complaint','insufficient_information','human_requested','other'] as const;
export type EscalationReason = typeof ESCALATION_REASONS[number];
export type EscalationAction = 'assign'|'note'|'resolve'|'cancel';
export interface SupportEscalation { id:string;ticketId:string;reason:EscalationReason;details:string;status:'requested'|'assigned'|'resolved'|'cancelled';operator:string|null;note:string;version:number;createdAt:string;assignedAt:string|null;resolvedAt:string|null;cancelledAt:string|null; }
export interface EscalationPage { active:SupportEscalation|null;items:SupportEscalation[];total:number;limit:number;offset:number; }
export interface EscalationEvent { id:number;type:string;oldStatus:string|null;newStatus:string;operator:string|null;note:string;createdAt:string; }
export interface EscalationEventPage { items:EscalationEvent[];total:number;limit:number;offset:number; }
