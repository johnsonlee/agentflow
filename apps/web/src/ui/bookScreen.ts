import {cloneBookData,readBookData,isWritableBook,BOOK_MAX_PAGES,BOOK_PAGE_CHARS,BOOK_TITLE_CHARS,BOOK_MAX_PHOTOS,type BookData,type ItemStack} from '@craft/engine';
import type {ExportPhoto} from '../assessment/portfolio-export';
import {prepareBookPhoto} from './bookPhotoPicker';
function el<K extends keyof HTMLElementTagNameMap>(tag:K,cls='',text=''):HTMLElementTagNameMap[K]{const node=document.createElement(tag);node.className=cls;node.textContent=text;return node;}
export interface BookScreenServices {photos():readonly ExportPhoto[];current():boolean;commit(book:BookData,title?:string):{ok:true}|{ok:false;error:string}}
/** Detached draft only. Lifecycle hide cancels; explicit user close commits healthy edits. */
export class BookScreen{
 readonly root=el('div','screen book-screen');private panel=el('div','panel book-panel');private stack:ItemStack|null=null;private draft:BookData={pages:['']};private page=0;private signing=false;private signingTitle='';private generation=0;private busy=false;private error='';
 constructor(container:HTMLElement,private onClose:()=>void,private services:BookScreenServices){this.root.hidden=true;this.root.append(this.panel);container.append(this.root);}
 get open():boolean{return !this.root.hidden;}
 show(stack:ItemStack):void{this.hide();this.stack=stack;this.draft=cloneBookData(stack.book??{pages:['']});if(!this.draft.pages.length)this.draft.pages=[''];this.page=0;this.signing=false;this.signingTitle='';this.error='';this.root.hidden=false;this.render();}
 hide():void{this.generation++;this.busy=false;this.stack=null;this.root.hidden=true;}
 userClose(title?:string):boolean{
  if(this.busy){this.generation++;this.busy=false;} // Explicit close cancels only the unfinished selection.
  if(this.stack&&isWritableBook(this.stack)){
   const result=this.services.commit(this.draft,title);if(!result.ok){this.error=result.error;this.render();return false;}
  }
  this.hide();return true;
 }
 private button(label:string,click:()=>void):HTMLButtonElement{const b=el('button','mc-button',label);b.type='button';b.addEventListener('click',click);return b;}
 private render():void{
  if(!this.stack)return;const writable=isWritableBook(this.stack),parts:HTMLElement[]=[];
  parts.push(el('h2','book-title',writable?'Book and Quill':this.draft.title??'Book'));
  if(!writable)parts.push(el('p','book-author',`by ${this.draft.author??'?'}`));
  const status=el('p','book-status',this.error);status.setAttribute('role',this.error?'alert':'status');status.setAttribute('aria-live','polite');parts.push(status);
  if(writable&&this.signing){const title=el('input','mc-input');title.maxLength=BOOK_TITLE_CHARS;title.value=this.signingTitle;title.addEventListener('input',()=>{this.signingTitle=title.value;});title.setAttribute('aria-label','Book title');title.addEventListener('keydown',e=>e.stopPropagation());parts.push(el('p','hint','Signing makes text and photos read-only.'),title,this.button('Sign and Close',()=>{this.signingTitle=title.value;if(this.userClose(title.value))this.onClose();}),this.button('Cancel',()=>{this.signing=false;this.render();}));this.panel.replaceChildren(...parts);title.focus();return;}
  const image=this.draft.photoPages?.entries.find(p=>p.page===this.page);
  if(image){const figure=el('figure','book-photo'),img=el('img');img.src=image.dataUrl;img.alt=image.caption||`Photo on page ${this.page+1}`;figure.append(img,el('figcaption','',image.caption));parts.push(figure);}
  if(writable){const text=el('textarea','mc-input book-page');text.value=this.draft.pages[this.page];text.maxLength=BOOK_PAGE_CHARS;text.setAttribute('aria-label','Book page');text.addEventListener('keydown',e=>e.stopPropagation());text.addEventListener('input',()=>{this.draft.pages[this.page]=text.value;});parts.push(text);
   const picture=this.button(image?'Replace photo':'Insert photo',()=>this.picker());picture.disabled=this.busy;parts.push(picture);
   if(image){const caption=el('input','mc-input');caption.value=image.caption;caption.maxLength=200;caption.setAttribute('aria-label','Photo caption');caption.addEventListener('keydown',e=>e.stopPropagation());caption.addEventListener('input',()=>{image.caption=caption.value;});parts.push(caption,this.button('Remove photo',()=>{this.draft.photoPages!.entries=this.draft.photoPages!.entries.filter(p=>p.page!==this.page);this.render();}));}
  }else parts.push(el('p','book-text',this.draft.pages[this.page]));
  const nav=el('div','book-nav'),prev=this.button('◀',()=>{this.page--;this.render();}),next=this.button('▶',()=>{if(this.page===this.draft.pages.length-1)this.draft.pages.push('');this.page++;this.render();});prev.setAttribute('aria-label','Previous page');next.setAttribute('aria-label','Next page');prev.disabled=this.busy||this.page===0;next.disabled=this.busy||(this.page===this.draft.pages.length-1&&(!writable||this.draft.pages.length>=BOOK_MAX_PAGES));nav.append(prev,el('span','book-page-number',`Page ${this.page+1} of ${this.draft.pages.length}`),next);parts.push(nav);
  if(writable){const sign=this.button('Sign',()=>{this.signing=true;this.render();});sign.disabled=this.busy;parts.push(sign);if(this.draft.pages.length>1)parts.push(this.button('Delete page',()=>{const page=this.page;this.draft.pages.splice(page,1);if(this.draft.photoPages)this.draft.photoPages.entries=this.draft.photoPages.entries.filter(p=>p.page!==page).map(p=>({...p,page:p.page>page?p.page-1:p.page}));this.page=Math.min(page,this.draft.pages.length-1);this.render();}));}
  if(writable)parts.push(this.button('Discard changes',()=>{this.hide();this.onClose();}));
  parts.push(this.button('Done',()=>this.onClose()));this.panel.replaceChildren(...parts);
 }
 private picker():void{
  if(!this.services.current()){this.error='This book owner changed. Close and reopen it.';this.render();return;}
  const generation=++this.generation,page=this.page;let photos:readonly ExportPhoto[];
  try{photos=this.services.photos();}catch{this.error='Portfolio could not be read. Your book is unchanged.';this.render();return;}
  const heading=el('h3','','Choose Portfolio photo'),status=el('p','hint',photos.length?'Photos are copied into this book. Removing a Portfolio original will not remove the copy.':'No Portfolio photos. Take a photo with a Camera first.'),list=el('div','book-photo-picker');
  for(const photo of photos){const b=this.button(photo.caption||'Choose photo',()=>{
   if(this.busy)return;if(!this.draft.photoPages?.entries.some(p=>p.page===page)&&(this.draft.photoPages?.entries.length??0)>=BOOK_MAX_PHOTOS){this.error='This book has reached the 8-photo application limit.';this.render();return;}
   this.busy=true;status.textContent='Loading photo…';const current=()=>this.open&&this.generation===generation&&this.services.current();
   void prepareBookPhoto(photo,page,current).then(result=>{if(!current())return;const entries=(this.draft.photoPages?.entries??[]).filter(p=>p.page!==page);const candidate=readBookData({...this.draft,photoPages:{version:1,entries:[...entries,result].sort((a,b)=>a.page-b.page)}});this.draft=candidate;this.error='';}).catch(error=>{if(current())this.error=error instanceof Error?error.message:'Photo could not be inserted.';}).finally(()=>{if(this.open&&this.generation===generation){this.busy=false;this.render();}});
  });const img=el('img');img.src=photo.dataUrl;img.alt=photo.caption||'Portfolio photo';b.prepend(img);list.append(b);}
  const cancel=this.button('Cancel photo selection',()=>{this.generation++;this.busy=false;this.render();});this.panel.replaceChildren(heading,status,list,cancel);cancel.focus();
 }
}
