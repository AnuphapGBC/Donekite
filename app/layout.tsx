import type { Metadata } from 'next';
import './globals.css';
import './workspace.css';
import './account.css';
export const metadata: Metadata = {
  title: 'DoneKite — less admin, more business',
  description: 'A shared workspace for service businesses. Manage customer enquiries, prepare quotes, track invoices, and keep your team in sync.',
  icons:{icon:'/favicon.svg'}
};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>) {
  return <html lang="en"><body>{children}</body></html>;
}
