import { Injectable, inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { DynamicFormSchema, FormFieldConfig } from '../models/dynamic-form.model';

@Injectable({
  providedIn: 'root'
})
export class DynamicFormService {
  private fb = inject(FormBuilder);

  /**
   * Génère dynamiquement un FormGroup Angular réactif à partir du schéma JSON fourni par l'IA
   */
  createFormGroup(schema: DynamicFormSchema): FormGroup {
    const group: { [key: string]: any } = {};

    schema.fields.forEach((field: FormFieldConfig) => {
      const validators = [];

      if (field.required) {
        validators.push(Validators.required);
      }

      if (field.type === 'email') {
        validators.push(Validators.email);
      }

      if (field.min !== undefined) {
        validators.push(Validators.min(field.min));
      }

      if (field.max !== undefined) {
        validators.push(Validators.max(field.max));
      }

      // Valeur initiale selon le type de champ
      const defaultValue = field.type === 'checkbox' ? false : '';

      group[field.name] = [defaultValue, validators];
    });

    return this.fb.group(group);
  }
}