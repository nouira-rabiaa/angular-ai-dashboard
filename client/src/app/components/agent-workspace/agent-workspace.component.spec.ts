import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { AgentRunResponse } from '../../models/agent-run.model';
import { AgentService } from '../../services/agent.service';
import { AgentWorkspaceComponent } from './agent-workspace.component';

describe('AgentWorkspaceComponent', () => {
  let fixture: ComponentFixture<AgentWorkspaceComponent>;
  let component: AgentWorkspaceComponent;
  let run: jest.Mock<Observable<AgentRunResponse>, [string]>;

  const response: AgentRunResponse = {
    runId: 'run-123',
    status: 'completed',
    answer: 'There are 3 form submissions.',
    trace: [{
      step: 1,
      tool: 'count_form_submissions',
      status: 'completed',
      result: { count: 3 }
    }]
  };

  beforeEach(() => {
    run = jest.fn<Observable<AgentRunResponse>, [string]>();
    TestBed.configureTestingModule({
      imports: [AgentWorkspaceComponent],
      providers: [{ provide: AgentService, useValue: { run } }]
    });
    fixture = TestBed.createComponent(AgentWorkspaceComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('shows the empty state and keeps submission disabled for a blank goal', () => {
    const button = fixture.nativeElement.querySelector('.run-button') as HTMLButtonElement;

    expect(fixture.nativeElement.textContent).toContain('Ready when you are');
    expect(button.disabled).toBe(true);
    component.runAgent();
    expect(run).not.toHaveBeenCalled();
  });

  it('disables goal controls while a run is pending', () => {
    const pending = new Subject<AgentRunResponse>();
    run.mockReturnValue(pending);
    component.goal.set('Count submissions');
    fixture.detectChanges();

    component.runAgent();
    fixture.detectChanges();

    expect(component.state()).toBe('running');
    expect((fixture.nativeElement.querySelector('#agent-goal') as HTMLTextAreaElement).disabled).toBe(true);
    expect((fixture.nativeElement.querySelector('.run-button') as HTMLButtonElement).disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Agent is working');
    pending.complete();
  });

  it('renders the final answer and safe execution result', () => {
    run.mockReturnValue(of(response));
    component.goal.set('Count submissions');

    component.runAgent();
    fixture.detectChanges();

    expect(run).toHaveBeenCalledWith('Count submissions');
    expect(fixture.nativeElement.textContent).toContain('Count form submissions');
    expect(fixture.nativeElement.textContent).toContain('completed');
    expect(fixture.nativeElement.textContent).toContain('3 form submissions');
    expect(fixture.nativeElement.textContent).toContain('There are 3 form submissions.');
  });

  it('shows a recoverable error and allows retry', () => {
    run.mockReturnValue(throwError(() => new Error('backend unavailable')));
    component.goal.set('Count submissions');

    component.runAgent();
    fixture.detectChanges();

    expect(component.state()).toBe('failed');
    expect(fixture.nativeElement.textContent).toContain('The agent could not finish');
    expect(fixture.nativeElement.textContent).toContain('Check the backend connection');
    expect(fixture.nativeElement.querySelector('.retry-button')).not.toBeNull();
  });
});