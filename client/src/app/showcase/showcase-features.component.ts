import { Component, ElementRef, OnDestroy, ViewChild, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

export const SHOWCASE_CAPTURES = [
  { id:'overview',file:'dashboard-overview',width:2868,height:1392 },
  { id:'history',file:'dashboard-history',width:2872,height:1394 },
  { id:'simulator',file:'finops-simulator',width:2870,height:1392 },
  { id:'generator',file:'ai-generator',width:2862,height:1392 },
  { id:'configuration',file:'studio-configuration',width:2872,height:1374 },
  { id:'tickets',file:'studio-tickets',width:2864,height:1390 },
  { id:'automation',file:'studio-automation',width:2870,height:1384 }
] as const;
type Capture = typeof SHOWCASE_CAPTURES[number];
@Component({selector:'app-showcase-features',standalone:true,imports:[TranslocoPipe],template:`
  <section class="features" aria-labelledby="features-title">
    <header><p class="eyebrow">Enterprise AI Dashboard & Support Agent Studio</p><h1 id="features-title">{{ 'gallery.title' | transloco }}</h1><p>{{ 'gallery.intro' | transloco }}</p></header>
    <div class="capture-grid">
      @for(capture of captures;track capture.id){
        <figure class="capture-card">
          <button type="button" (click)="enlarge(capture,$event)" [attr.aria-label]="'gallery.enlarge' | transloco:{title:('gallery.'+capture.id+'.title' | transloco)}">
            <img [src]="imagePath(capture)" [width]="capture.width" [height]="capture.height" loading="lazy" decoding="async" [alt]="'gallery.'+capture.id+'.title' | transloco" />
            <span>{{ 'gallery.zoom' | transloco }} ↗</span>
          </button>
          <figcaption><h2>{{ 'gallery.'+capture.id+'.title' | transloco }}</h2><p>{{ 'gallery.'+capture.id+'.description' | transloco }}</p><small>{{ 'gallery.static' | transloco }}</small></figcaption>
        </figure>
      }
    </div>
  </section>
  <dialog #viewer class="capture-dialog" aria-labelledby="capture-title" (close)="onClosed()" (keydown.escape)="close($event)">
    <header><h2 id="capture-title">{{ selected() ? ('gallery.'+selected()!.id+'.title' | transloco) : ('gallery.title' | transloco) }}</h2><button type="button" autofocus (click)="close()">{{ 'gallery.close' | transloco }}</button></header>
    @if(selected();as capture){<img [src]="imagePath(capture)" [width]="capture.width" [height]="capture.height" [alt]="'gallery.'+capture.id+'.title' | transloco" /><p>{{ 'gallery.static' | transloco }}</p>}
  </dialog>
`})
export class ShowcaseFeaturesComponent implements OnDestroy {
  readonly captures=SHOWCASE_CAPTURES;
  readonly selected=signal<Capture|null>(null);
  @ViewChild('viewer',{static:true}) viewer!:ElementRef<HTMLDialogElement>;
  private trigger:HTMLElement|null=null;
  imagePath(capture:Capture){return 'assets/showcase/screenshots/'+capture.file+'.png';}
  enlarge(capture:Capture,event:Event){
    this.trigger=event.currentTarget as HTMLElement;this.selected.set(capture);
    this.viewer.nativeElement.showModal();this.viewer.nativeElement.querySelector('button')?.focus();
  }
  close(event?:Event){event?.preventDefault();this.viewer.nativeElement.close();}
  onClosed(){this.selected.set(null);if(this.trigger?.isConnected)this.trigger.focus();this.trigger=null;}
  ngOnDestroy(){if(this.viewer.nativeElement.open)this.viewer.nativeElement.close();this.onClosed();}
}
