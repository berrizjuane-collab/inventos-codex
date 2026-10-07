import React, { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
const legacy = location.pathname.startsWith('/laboratorio');
const App = lazy(() => legacy ? import('./App') : import('./k2/K2App'));
document.title = legacy ? 'Campo · Laboratorio vectorial' : 'K2 — Atlas interactivo';
createRoot(document.getElementById('root')!).render(<Suspense fallback={<p style={{padding:32,fontFamily:'system-ui'}}>Preparando el atlas…</p>}><App/></Suspense>);
