export type FieldType = 'text' | 'number' | 'email' | 'textarea' | 'select' | 'checkbox';

export interface FormFieldConfig {
  name: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  required?: boolean;
  options?: { label: string; value: string }[]; // Uniquement pour le type 'select'
  min?: number;                                 // Pour le type 'number'
  max?: number;
}

export interface DynamicFormSchema {
  title: string;
  description?: string;
  fields: FormFieldConfig[];
}