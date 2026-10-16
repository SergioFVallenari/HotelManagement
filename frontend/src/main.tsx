import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'bootstrap/dist/css/bootstrap.min.css'
// Mismo modulo que importan Modal.tsx / ConfirmDialog.tsx: si este import
// trajera el bundle UMD (dist/js/bootstrap.bundle.min.js) habria DOS copias
// de Bootstrap, cada una registrando su data-api en document, y todo toggle
// (dropdown, offcanvas) se dispararia dos veces y terminaria cerrado.
import 'bootstrap'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
