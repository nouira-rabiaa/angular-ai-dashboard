import { Component, Input, Output, EventEmitter, signal, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup, FormControl, Validators } from '@angular/forms';
import { DynamicFormSchema } from '../../models/dynamic-form.model';

@Component({
  selector: 'app-dynamic-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './dynamic-form.component.html',
  styleUrl: './dynamic-form.component.scss',
  encapsulation: ViewEncapsulation.None // 🟢 Force l'application globale des styles du formulaire
})
export class DynamicFormComponent {
  @Input() schema!: DynamicFormSchema;
  @Output() formSubmit = new EventEmitter<any>();

  formGroup = signal<FormGroup | null>(null);

  ngOnChanges() {
    if (this.schema && this.schema.fields) {
      const group: any = {};
      this.schema.fields.forEach(field => {
        group[field.name] = new FormControl('', field.required ? Validators.required : []);
      });
      this.formGroup.set(new FormGroup(group));
    }
  }

  onSubmit() {
    const fg = this.formGroup();
    if (fg && fg.valid) {
      this.formSubmit.emit(fg.value);
    }
  }
}