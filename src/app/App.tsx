import { lazy, Suspense, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Link, Route, Router, Routes, useLocation } from 'react-router-dom';
import { customerApi, withManagedAvailability } from '../lib/api';
import type { Locale } from '../types/api';
import { createPrivateHistory } from './private-history';
import { parseManageFragment } from '../features/manage-booking/fragment';

const HomePage=lazy(()=>import('../features/public-site/HomePage').then(m=>({default:m.HomePage})));
const BookingPage=lazy(()=>import('../features/booking/BookingPage').then(m=>({default:m.BookingPage})));
const ConfirmationPage=lazy(()=>import('../features/booking/ConfirmationPage').then(m=>({default:m.ConfirmationPage})));
const ManageBookingPage=lazy(()=>import('../features/manage-booking/ManageBookingPage').then(m=>({default:m.ManageBookingPage})));

const LOCALE_KEY = 'hm-locale';

function initialLocale(): Locale {
  try {
    const stored = localStorage.getItem(LOCALE_KEY);
    if (stored === 'th' || stored === 'en') return stored;
  } catch { /* storage unavailable */ }
  return 'th';
}

function ManagedRoute({locale,onLocaleChange}:{locale:Locale;onLocaleChange:(locale:Locale)=>void}) {
  const location=useLocation();
  const [link,setLink]=useState(()=>parseManageFragment(location.hash));
  useEffect(()=>{
    const next=parseManageFragment(location.hash);
    if(next)setLink(current=>current?.bookingId===next.bookingId&&current.token===next.token?current:next);
  },[location.hash]);
  const api=useMemo(()=>link?withManagedAvailability(customerApi,link):customerApi,[link]);
  return <ManageBookingPage api={api} locale={locale} onLocaleChange={onLocaleChange}/>;
}

function Pages() {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const location=useLocation();
  useEffect(()=>{if(!location.hash)window.scrollTo({top:0,behavior:'instant'});},[location.pathname]);
  const onLocaleChange = (next: Locale) => {
    setLocale(next);
    try { localStorage.setItem(LOCALE_KEY, next); } catch { /* ignore */ }
  };
  const page = { api: customerApi, locale, onLocaleChange };

  return (
    <Suspense fallback={<main className="setup-shell" role="status">{locale==='th'?'กำลังโหลด…':'Loading…'}</main>}>
      <Routes>
        <Route path="/" element={<HomePage {...page} />} />
        <Route path="/book" element={<BookingPage {...page} />} />
        <Route path="/confirmation" element={<ConfirmationPage {...page} />} />
        <Route path="/manage" element={<ManagedRoute locale={locale} onLocaleChange={onLocaleChange} />} />
        <Route path="*" element={<main className="setup-shell"><h1>{locale==='th'?'ไม่พบหน้าที่ต้องการ':'Page not found'}</h1><Link to="/">Hook Menclub</Link></main>} />
      </Routes>
    </Suspense>
  );
}

export function App() {
  const [history]=useState(()=>createPrivateHistory(window));
  const location=useSyncExternalStore(history.subscribe,history.getSnapshot);
  return <Router basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'} location={location} navigator={history.navigator}><Pages/></Router>;
}
