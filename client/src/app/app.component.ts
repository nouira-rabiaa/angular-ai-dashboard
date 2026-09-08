import { Component } from '@angular/core';
import { ChatComponent } from './components/chat/chat.component'; // Import du composant Chat
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  
  imports: [ChatComponent, RouterOutlet], // <-- Obligatoire pour utiliser <app-chat>
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'Angular AI Dashboard';
}