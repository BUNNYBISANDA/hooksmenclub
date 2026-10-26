import { createPath, parsePath, type Location, type Navigator, type To } from 'react-router-dom';

type Browser = Pick<Window,'location'|'history'|'addEventListener'|'removeEventListener'>;
/** Route state stays in memory; browser history receives only an opaque navigation key. */
export function createPrivateHistory(browser:Browser) {
  const states=new Map<string,unknown>();
  const listeners=new Set<()=>void>();
  let location:Location;
  const key=()=>crypto.randomUUID();
  const read=(entryKey:string):Location=>({
    pathname:browser.location.pathname,search:browser.location.search,hash:browser.location.hash,
    key:entryKey,state:states.get(entryKey)??null,
  });
  const initialKey=key();
  browser.history.replaceState({hookKey:initialKey},'');
  location=read(initialKey);
  const emit=()=>{for(const listener of listeners)listener();};
  const href=(to:To)=>typeof to==='string'?to:createPath(to);
  const navigate=(replace:boolean,to:To,state:unknown)=>{
    const entryKey=key();
    if(replace)states.delete(location.key);
    states.set(entryKey,state??null);
    if(states.size>30)states.delete(states.keys().next().value!);
    browser.history[replace?'replaceState':'pushState']({hookKey:entryKey},'',href(to));
    location=read(entryKey);emit();
  };
  const onPop=()=>{
    const entryKey=typeof browser.history.state?.hookKey==='string'?browser.history.state.hookKey:key();
    location=read(entryKey);emit();
  };
  const navigator:Navigator={
    createHref:href,
    encodeLocation:(to)=>{const parsed=typeof to==='string'?parsePath(to):to;return {pathname:parsed.pathname??'/',search:parsed.search??'',hash:parsed.hash??''};},
    go:(delta)=>browser.history.go(delta),
    push:(to,state)=>navigate(false,to,state),
    replace:(to,state)=>navigate(true,to,state),
  };
  return {
    navigator,
    getSnapshot:()=>location,
    subscribe:(listener:()=>void)=>{
      if(listeners.size===0){browser.addEventListener('popstate',onPop);browser.addEventListener('hashchange',onPop);}
      listeners.add(listener);
      return ()=>{listeners.delete(listener);if(listeners.size===0){browser.removeEventListener('popstate',onPop);browser.removeEventListener('hashchange',onPop);}};
    },
  };
}
