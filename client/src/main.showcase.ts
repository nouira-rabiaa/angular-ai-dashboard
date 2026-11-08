import { bootstrapApplication } from '@angular/platform-browser';
import { ShowcaseComponent } from './app/showcase/showcase.component';
import { showcaseConfig } from './app/showcase/showcase.config';
bootstrapApplication(ShowcaseComponent, showcaseConfig).catch(error => console.error(error));
