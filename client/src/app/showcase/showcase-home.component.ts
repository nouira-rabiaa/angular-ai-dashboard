import { RouterLink } from '@angular/router';
import { Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
@Component({selector:'app-showcase-home',standalone:true,imports:[TranslocoPipe,RouterLink],host:{class:'showcase-home'},template:`
  <section class="hero" aria-labelledby="public-title">
    <div><p class="eyebrow">{{ 'showcase.eyebrow' | transloco }}</p><h1 id="public-title">{{ 'showcase.title' | transloco }}</h1><p class="intro">{{ 'showcase.intro' | transloco }}</p><a class="primary" href="#capabilities">{{ 'showcase.discover' | transloco }} <span aria-hidden="true">↗</span></a><div class="discovery-links"><a routerLink="/guided-demo">{{ 'nav.guidedDemo' | transloco }} →</a><a routerLink="/architecture">{{ 'nav.architecture' | transloco }} →</a></div><p class="consultative">{{ 'showcase.consultative' | transloco }}</p></div>
    <figure class="preview"><a routerLink="/features" [attr.aria-label]="'gallery.browse' | transloco"><img class="home-capture" src="assets/showcase/screenshots/dashboard-overview.png" width="2868" height="1392" [alt]="'gallery.overview.title' | transloco" /></a><figcaption>{{ 'gallery.homeCaption' | transloco }}</figcaption><p>{{ 'gallery.static' | transloco }}</p></figure>
  </section>
  <section id="capabilities" aria-labelledby="capabilities-title"><h2 id="capabilities-title">{{ 'showcase.capabilities' | transloco }}</h2><div class="capability-grid">
    @for(item of capabilities;track item.key){<article><span class="capability-icon" [class.teal]="item.key==='studio'" aria-hidden="true">{{ item.icon }}</span><h3>{{ ('showcase.'+item.key) | transloco }}</h3><p>{{ ('showcase.'+item.key+'Text') | transloco }}</p></article>}
  </div></section>
  <section id="scope" class="scope" aria-labelledby="scope-title"><span class="capability-icon teal" aria-hidden="true">◎</span><div><h2 id="scope-title">{{ 'showcase.limitsTitle' | transloco }}</h2><p>{{ 'showcase.limitsText' | transloco }}</p></div></section>
`})
export class ShowcaseHomeComponent { readonly capabilities=[{key:'finops',icon:'↗'},{key:'generator',icon:'✧'},{key:'studio',icon:'◇'}]; }
