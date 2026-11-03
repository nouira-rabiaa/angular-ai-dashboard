import { Component } from '@angular/core';
import { AgentConfigurationComponent } from './agent-configuration.component';

@Component({
  selector: 'app-agent-workspace',
  standalone: true,
  imports: [AgentConfigurationComponent],
  template: '<app-agent-configuration />',
  styles: [':host { display: block; min-width: 0; }']
})
export class AgentWorkspaceComponent {}
