import { expect,it } from 'vitest';
import { createPrivateHistory } from '../src/app/private-history';

function browserHarness() {
  const target=new EventTarget();let url=new URL('https://example.test/');
  const entries:{state:unknown;url:string}[]=[{state:{usr:{manageToken:'restored-secret'}},url:url.href}];let index=0;
  const history={
    get state(){return entries[index].state;},
    replaceState(state:unknown,_title:string,to?:string|URL|null){if(to)url=new URL(to,url);entries[index]={state,url:url.href};},
    pushState(state:unknown,_title:string,to?:string|URL|null){if(to)url=new URL(to,url);entries.splice(++index);entries.push({state,url:url.href});},
    go(delta:number){index=Math.max(0,Math.min(entries.length-1,index+delta));url=new URL(entries[index].url);target.dispatchEvent(new Event('popstate'));},
  };
  const browser={get location(){return url;},history,addEventListener:target.addEventListener.bind(target),removeEventListener:target.removeEventListener.bind(target)};
  return {browser:browser as unknown as Window,entries};
}
it('keeps confirmation data out of history.state while preserving navigation in memory',()=>{
  const {browser,entries}=browserHarness();const history=createPrivateHistory(browser);const unsubscribe=history.subscribe(()=>{});
  const privateState={booking:{customerName:'TEST PERSON'},manageToken:'private-secret'};
  history.navigator.push('/confirmation',privateState);
  expect(history.getSnapshot().state).toEqual(privateState);
  expect(JSON.stringify(entries)).not.toMatch(/private-secret|TEST PERSON|restored-secret/);
  history.navigator.push('/book');history.navigator.go(-1);
  expect(history.getSnapshot().pathname).toBe('/confirmation');expect(history.getSnapshot().state).toEqual(privateState);
  const reloaded=createPrivateHistory(browser);expect(reloaded.getSnapshot().state).toBeNull();unsubscribe();
});
it('supports deep link fragments and replacement without serializing route state',()=>{
  const {browser,entries}=browserHarness();const history=createPrivateHistory(browser);
  history.navigator.replace({pathname:'/manage',hash:'#booking=test&token=secure'},{hidden:'value'});
  expect(history.getSnapshot().hash).toBe('#booking=test&token=secure');expect(entries).toHaveLength(1);
  expect(browser.history.state).toEqual({hookKey:expect.any(String)});
});
