import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/primitives';
import App from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 }, mutations: { retry: 0 } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <App />
        <Toaster theme="dark" position="bottom-right" richColors closeButton toastOptions={{ style: { background: 'rgb(15 17 48 / 0.92)', border: '1px solid rgb(255 255 255 / 0.12)', backdropFilter: 'blur(20px)', borderRadius: 16 } }} />
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>
);
