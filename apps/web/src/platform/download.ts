/** Browser-local download; each URL is owned, cancellable and bounded to30 seconds. */
export function downloadBlob(blob:Blob,name:string,current:()=>boolean=()=>true,onDisposed:()=>void=()=>{}):()=>void{
 if(!current())throw Error('Portfolio export cancelled.');const url=URL.createObjectURL(blob);let disposed=false,timer:ReturnType<typeof setTimeout>|undefined;const dispose=()=>{if(disposed)return;disposed=true;if(timer!==undefined)clearTimeout(timer);URL.revokeObjectURL(url);onDisposed();};
 try{const link=document.createElement('a');link.href=url;link.download=name;link.hidden=true;document.body.appendChild(link);try{if(!current())throw Error('Portfolio export cancelled.');link.click();}finally{link.remove();}timer=setTimeout(dispose,30000);return dispose;}catch(error){dispose();throw error;}
}
