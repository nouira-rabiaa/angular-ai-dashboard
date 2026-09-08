import { Component, Input, OnChanges, SimpleChanges, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup } from '@angular/forms';
import { DynamicFormSchema } from '../../models/dynamic-form.model';
import { DynamicFormService } from '../../services/dynamic-form.service';

@Component({
  selector: 'app-dynamic-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './dynamic-form.component.html',
  styleUrl: './dynamic-form.component.scss'
})
export class DynamicFormComponent implements OnChanges {
  private formService = inject(DynamicFormService);

  @Input() schema: DynamicFormSchema | null = null;
  formSubmitted = output<any>();

  formGroup = signal<FormGroup | null>(null);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['schema'] && this.schema) {
      const group = this.formService.createFormGroup(this.schema);
      this.formGroup.set(group);
    }
  }

  onSubmit(): void {
    const fg = this.formGroup();
    if (fg && fg.valid) {
      this.formSubmitted.emit(fg.value);
    } else if (fg) {
      fg.markAllAsTouched();
    }
  }
}